"""One-time demo seed. In production this mapping would come from registration."""

from firebase_utils import set_value

DEMO_MAPPING = {
    # Live demo mapping from the Telegram updates supplied for this setup.
    # The Tehsil destination is a private chat because that account has
    # already sent /start to the bot and can therefore receive messages.
    "village_X": {"chat_id": "-1003969361301", "level": "village", "parent": "tehsil_Z"},
    "tehsil_Z": {"chat_id": "1661739491", "level": "tehsil", "parent": None},
}


if __name__ == "__main__":
    set_value("hierarchy_mapping", DEMO_MAPPING)
    print("Seeded hierarchy_mapping with village_X -> tehsil_Z")