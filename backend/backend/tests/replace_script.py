import sys

with open('backend/routes/session_router.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = '''    return {
        "session_id": session.id,
        "topic": session.topic,
        "status": session.status,
    }'''

new_str = '''    return {
        "session_id": session.id,
        "session_status": "active",
        "current_topic": current_topic,
        "current_point": current_point,
        "kido_message": "Let's begin!"
    }'''

if old_str in content:
    with open('backend/routes/session_router.py', 'w', encoding='utf-8') as f:
        f.write(content.replace(old_str, new_str))
    print('Replaced')
else:
    print('Not found')
