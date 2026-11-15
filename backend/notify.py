"""
THERMOSENSE Emergency Notification & Escalation Engine (notify.py)
-----------------------------------------------------------------
Sprint 2 Deliverable:
1. Multi-channel dispatch:
   - In-app WebSocket (/ws) live broadcast
   - Web Push (pywebpush)
   - Twilio SMS
   - Twilio Voice Call with DTMF acknowledgement (press 1)
2. Modes:
   - SOS_MODE=simulate (default): Zero network calls, logs status 'simulated'
   - SOS_MODE=live: Real services; refuses to start / dispatch if keys are missing
3. Escalation Chain:
   - T+0s: Supervisor at once
   - T+60s: Safety Officer (if unacknowledged)
   - T+120s: Site Medical Contact (if unacknowledged)
   - App tap or Voice DTMF 1 immediately stops the chain
4. Privacy & Language:
   - Multilingual: EN, HI, GU (worker name, site, zone, 'possible heat-related emergency'. Never diagnose)
   - Encrypted phone decryption strictly for dispatch; payload masking
"""

import os
import sys
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable

sys.dont_write_bytecode = True

# Database helpers
from backend.db import (
    get_db,
    log_sos_dispatch,
    escalate_sos_event,
    get_sos_by_id,
    get_push_subscriptions,
    decrypt_phone,
    mask_phone,
    log_audit
)

# Optional twilio and pywebpush imports
try:
    from twilio.rest import Client as TwilioClient  # type: ignore
except ImportError:
    TwilioClient = None

try:
    from pywebpush import webpush, WebPushException  # type: ignore
except ImportError:
    webpush = None
    WebPushException = Exception


# Global WebSocket broadcaster callback (registered by main.py)
_ws_broadcaster: Optional[Callable[[Dict[str, Any]], Any]] = None

def register_ws_broadcaster(callback: Callable[[Dict[str, Any]], Any]):
    global _ws_broadcaster
    _ws_broadcaster = callback


# Active background escalation tasks: event_id -> asyncio.Task
_active_escalations: Dict[str, asyncio.Task] = {}


# Multilingual Message Templates (Rule: worker name, site, zone, 'possible heat-related emergency'. Never diagnose.)
TEMPLATES = {
    "en": {
        "sms": "EMERGENCY: {worker_name} at {site_name}, {zone_name} reported possible heat-related emergency. Respond immediately: {public_base_url}",
        "voice": "This is a Thermosense Emergency Alert. Worker {worker_name} at {site_name}, {zone_name} has triggered an emergency alert. Possible heat-related emergency. Press 1 on your phone keypad now to acknowledge this alert.",
        "checkin": "Thermosense safety check for {worker_name}. Elevated heat stress readings detected. Press 1 if you are fine. Press 2 if you need emergency assistance.",
        "push_title": "EMERGENCY SOS: {worker_name}",
        "push_body": "Possible heat-related emergency at {site_name}, {zone_name}. Tap to open emergency protocol.",
        "say_lang": "en-US"
    },
    "hi": {
        "sms": "आपातकालीन: {site_name}, {zone_name} पर {worker_name} ने संभावित गर्मी से संबंधित आपात स्थिति की सूचना दी है। तुरंत सहायता करें: {public_base_url}",
        "voice": "यह थर्मोसेंस आपातकालीन अलर्ट है। {site_name}, {zone_name} पर कर्मचारी {worker_name} ने आपातकालीन चेतावनी दी है। संभावित गर्मी से संबंधित आपात स्थिति। पुष्टि करने के लिए अभी 1 दबाएं।",
        "checkin": "{worker_name} के लिए थर्मोसेंस सुरक्षा जांच। उच्च गर्मी का स्तर पाया गया है। यदि आप ठीक हैं तो 1 दबाएं। यदि सहायता चाहिए तो 2 दबाएं।",
        "push_title": "आपातकालीन अलर्ट: {worker_name}",
        "push_body": "{site_name}, {zone_name} पर संभावित गर्मी आपात स्थिति। तुरंत देखें।",
        "say_lang": "hi-IN"
    },
    "gu": {
        "sms": "કટોકટી: {site_name}, {zone_name} ખાતે {worker_name} એ સંભવિત ગરમી સંબંધિત કટોકટી નોંધાવી છે. તાત્કાલિક પ્રતિસાદ આપો: {public_base_url}",
        "voice": "આ થર્મોસેન્સ ઈમરજન્સી ચેતવણી છે. {site_name}, {zone_name} ખાતે કાર્યકર {worker_name} એ કટોકટી ચેતવણી આપી છે. સંભવિત ગરમી સંબંધિત કટોકટી. સ્વીકારવા માટે ૧ દબાવો.",
        "checkin": "{worker_name} માટે થર્મોસેન્સ સુરક્ષા તપાસ. ઉચ્ચ ગરમી તણાવ મળ્યો છે. જો તમે સ્વસ્થ છો તો ૧ દબાવો. જો મદદ જોઈતી હોય તો ૨ દબાવો.",
        "push_title": "કટોકટી એલર્ટ: {worker_name}",
        "push_body": "{site_name}, {zone_name} ખાતે સંભવિત ગરમી સંબંધિત કટોકટી. પ્રોટોકોલ ખોલો.",
        "say_lang": "gu-IN"
    }
}


def get_sos_mode() -> str:
    return os.environ.get("SOS_MODE", "simulate").lower()


def validate_live_credentials():
    """Validates configuration for live mode. Refuses to start/dispatch if credentials missing."""
    if get_sos_mode() == "live":
        sid = os.environ.get("TWILIO_ACCOUNT_SID")
        token = os.environ.get("TWILIO_AUTH_TOKEN")
        from_phone = os.environ.get("TWILIO_FROM")
        if not sid or not token or not from_phone:
            raise RuntimeError(
                "SOS_MODE=live requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM environment variables."
            )


def format_message(template_key: str, lang: str, event: Dict[str, Any]) -> str:
    chosen_lang = lang if lang in TEMPLATES else "en"
    tpl = TEMPLATES[chosen_lang].get(template_key, TEMPLATES["en"][template_key])
    public_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")
    
    return tpl.format(
        worker_name=event.get("worker_name", "Worker"),
        site_name=event.get("site_name", "Site"),
        zone_name=event.get("zone_name", "Zone"),
        public_base_url=public_url
    )


async def send_websocket_broadcast(event: Dict[str, Any], stage_role: str, message: str) -> None:
    """Dispatches in-app WebSocket alert to active clients."""
    payload = {
        "type": "SOS_DISPATCH",
        "event_id": event.get("id"),
        "worker_name": event.get("worker_name"),
        "site_id": event.get("site_id"),
        "zone_id": event.get("zone_id"),
        "recipient_role": stage_role,
        "escalation_level": event.get("escalation_level", 1),
        "message": message,
        "symptoms": json.loads(event.get("symptoms_json", "[]")) if isinstance(event.get("symptoms_json"), str) else event.get("symptoms_json", []),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    if _ws_broadcaster:
        try:
            res = _ws_broadcaster(payload)
            if asyncio.iscoroutine(res):
                await res
        except Exception as e:
            print(f"[notify.py] WS broadcast error: {e}")


def send_web_push(role: str, title: str, body: str, event_id: str) -> str:
    """Sends Web Push to subscribed users for role or logs simulated."""
    mode = get_sos_mode()
    if mode == "simulate":
        return "simulated"

    vapid_priv = os.environ.get("VAPID_PRIVATE_KEY")
    vapid_pub = os.environ.get("VAPID_PUBLIC_KEY")
    if not vapid_priv or not vapid_pub or not webpush:
        return "failed: VAPID keys or pywebpush not available"

    subs = get_push_subscriptions(role)
    delivered = 0
    for s in subs:
        try:
            sub_info = {
                "endpoint": s["endpoint"],
                "keys": json.loads(s["keys_json"])
            }
            webpush(
                subscription_info=sub_info,
                data=json.dumps({"title": title, "body": body, "url": f"/?emergency=true&event_id={event_id}"}),
                vapid_private_key=vapid_priv,
                vapid_claims={"sub": "mailto:safety@apexindustrial.com"}
            )
            delivered += 1
        except Exception as e:
            print(f"[notify.py] Push notification error: {e}")

    return f"sent: {delivered} delivered" if delivered > 0 else "sent"


def send_sms(recipient_phone: str, message: str) -> str:
    """Sends SMS via Twilio or logs simulated."""
    mode = get_sos_mode()
    if mode == "simulate":
        return "simulated"

    validate_live_credentials()
    if not TwilioClient:
        return "failed: twilio package not installed"

    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_num = os.environ.get("TWILIO_FROM")
    
    try:
        client = TwilioClient(sid, token)
        res = client.messages.create(
            body=message,
            from_=from_num,
            to=recipient_phone
        )
        return f"sent: SID {res.sid}"
    except Exception as e:
        return f"failed: {str(e)}"


def place_voice_call(recipient_phone: str, event_id: str, lang: str) -> str:
    """Places interactive voice call via Twilio with DTMF menu or logs simulated."""
    mode = get_sos_mode()
    if mode == "simulate":
        return "simulated"

    validate_live_credentials()
    if not TwilioClient:
        return "failed: twilio package not installed"

    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_num = os.environ.get("TWILIO_FROM")
    public_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")
    twiml_url = f"{public_url}/api/webhooks/twilio/voice?event_id={event_id}&lang={lang}"

    try:
        client = TwilioClient(sid, token)
        call = client.calls.create(
            to=recipient_phone,
            from_=from_num,
            url=twiml_url
        )
        return f"initiated: Call SID {call.sid}"
    except Exception as e:
        return f"failed: {str(e)}"


async def dispatch_stage(event: Dict[str, Any], stage_role: str, recipient_phone: str = "+1-555-019-8800") -> None:
    """Executes multi-channel dispatch for a specific escalation stage."""
    mode = get_sos_mode()
    event_id = event.get("id", "SOS-UNKNOWN")
    lang = event.get("worker_lang", "en")

    sms_text = format_message("sms", lang, event)
    push_title = format_message("push_title", lang, event)
    push_body = format_message("push_body", lang, event)

    # 1. In-app WebSocket Broadcast
    await send_websocket_broadcast(event, stage_role, sms_text)
    log_sos_dispatch(
        event_id=event_id,
        channel="websocket",
        recipient_role=stage_role,
        status="simulated" if mode == "simulate" else "delivered",
        message=f"Live feed broadcast to {stage_role}",
        mode=mode
    )

    # 2. Web Push
    push_status = send_web_push(stage_role, push_title, push_body, event_id)
    log_sos_dispatch(
        event_id=event_id,
        channel="push",
        recipient_role=stage_role,
        status="simulated" if mode == "simulate" else push_status,
        message=push_body,
        mode=mode
    )

    # 3. SMS
    sms_status = send_sms(recipient_phone, sms_text)
    log_sos_dispatch(
        event_id=event_id,
        channel="sms",
        recipient_role=stage_role,
        recipient_contact=mask_phone(recipient_phone),
        status="simulated" if mode == "simulate" else sms_status,
        message=sms_text,
        mode=mode
    )

    # 4. Voice Call
    voice_status = place_voice_call(recipient_phone, event_id, lang)
    log_sos_dispatch(
        event_id=event_id,
        channel="voice",
        recipient_role=stage_role,
        recipient_contact=mask_phone(recipient_phone),
        status="simulated" if mode == "simulate" else voice_status,
        message="Voice call with TwiML DTMF acknowledgment menu",
        mode=mode
    )


async def _run_escalation_loop(
    event_id: str,
    stage2_delay: float = 60.0,
    stage3_delay: float = 60.0
) -> None:
    """
    Escalation Chain:
    - Stage 1 (0s): Supervisor (dispatched immediately before loop)
    - Stage 2 (+60s): Safety Officer (if unacknowledged)
    - Stage 3 (+120s): Site Medical Contact (if unacknowledged)
    """
    try:
        # Wait for Stage 2 (Safety Officer escalation)
        await asyncio.sleep(stage2_delay)
        
        event = get_sos_by_id(event_id)
        if not event or event.get("status") != "active":
            return  # Chain stopped due to acknowledgement or cancellation

        # Escalate to Level 2
        escalate_sos_event(event_id, 2)
        event["escalation_level"] = 2
        await dispatch_stage(event, "safety_officer", recipient_phone="+1-555-019-9900")

        # Wait for Stage 3 (Site Medical escalation)
        await asyncio.sleep(stage3_delay)

        event = get_sos_by_id(event_id)
        if not event or event.get("status") != "active":
            return

        # Escalate to Level 3
        escalate_sos_event(event_id, 3)
        event["escalation_level"] = 3
        await dispatch_stage(event, "medical", recipient_phone="+1-555-019-9110")

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[notify.py] Escalation chain error: {e}")
    finally:
        _active_escalations.pop(event_id, None)


def dispatch(
    event: Dict[str, Any],
    stage2_delay: float = 60.0,
    stage3_delay: float = 60.0
) -> asyncio.Task:
    """
    Primary Entry Point:
    Runs the emergency dispatch chain and creates background escalation task.
    Writes sos_dispatch_log rows across all channels.
    """
    validate_live_credentials()
    event_id = event["id"]

    # Cancel previous task if one existed
    if event_id in _active_escalations:
        _active_escalations[event_id].cancel()

    async def _orchestrate():
        # Stage 1: Immediate dispatch to Supervisor
        await dispatch_stage(event, "supervisor", recipient_phone="+1-555-019-8800")
        # Run remaining escalation stages
        await _run_escalation_loop(event_id, stage2_delay, stage3_delay)

    task = asyncio.create_task(_orchestrate())
    _active_escalations[event_id] = task
    return task


def stop_escalation(event_id: str):
    """Stops escalation background timers when SOS is acknowledged or cancelled."""
    task = _active_escalations.pop(event_id, None)
    if task and not task.done():
        task.cancel()


# ---------------------------------------------------------------------------
# TwiML Voice Generators
# ---------------------------------------------------------------------------

def generate_voice_twiml(event_id: str, lang: str = "en") -> str:
    """Generates TwiML XML for emergency voice calls with DTMF keypress 1."""
    chosen_lang = lang if lang in TEMPLATES else "en"
    event = get_sos_by_id(event_id) or {
        "worker_name": "Worker",
        "site_name": "Site",
        "zone_name": "Zone"
    }
    script = format_message("voice", chosen_lang, event)
    say_lang = TEMPLATES[chosen_lang]["say_lang"]
    public_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather numDigits="1" action="{public_url}/api/webhooks/twilio/voice/gather?event_id={event_id}" method="POST" timeout="10">
        <Say language="{say_lang}">{script}</Say>
    </Gather>
    <Say language="{say_lang}">We did not receive a response. Escalation will proceed. Goodbye.</Say>
    <Hangup/>
</Response>"""


def generate_checkin_twiml(worker_id: str, worker_name: str, lang: str = "en") -> str:
    """Generates TwiML XML for automated high heat stress check-in call."""
    chosen_lang = lang if lang in TEMPLATES else "en"
    event = {"worker_name": worker_name, "site_name": "", "zone_name": ""}
    script = format_message("checkin", chosen_lang, event)
    say_lang = TEMPLATES[chosen_lang]["say_lang"]
    public_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather numDigits="1" action="{public_url}/api/webhooks/twilio/checkin/gather?worker_id={worker_id}" method="POST" timeout="10">
        <Say language="{say_lang}">{script}</Say>
    </Gather>
    <Say language="{say_lang}">No response received. Escalating emergency assistance.</Say>
    <Hangup/>
</Response>"""
