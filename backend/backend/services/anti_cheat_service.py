import re


class AntiCheatService:
    @staticmethod
    def _tokenize(text: str) -> list[str]:
        normalized = re.sub(r"[^\w\s]", " ", text.lower())
        return [token for token in normalized.split() if token]

    def check_plagiarism(self, user_input: str, slide_text: str) -> bool:
        user_tokens = self._tokenize(user_input)
        slide_tokens = self._tokenize(slide_text)

        if len(user_tokens) < 15 or len(slide_tokens) < 15:
            return False

        slide_sequences = {
            tuple(slide_tokens[i : i + 15]) for i in range(len(slide_tokens) - 14)
        }

        for i in range(len(user_tokens) - 14):
            if tuple(user_tokens[i : i + 15]) in slide_sequences:
                return True
        return False
