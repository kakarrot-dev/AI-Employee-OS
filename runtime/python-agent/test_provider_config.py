import unittest

from app.provider_config import ProviderConfig


class ProviderConfigTests(unittest.TestCase):
    def test_defaults_match_frozen_provider_decision(self):
        config = ProviderConfig()
        config.validate()
        self.assertEqual(config.deepseek_model, "deepseek-v4-flash")
        self.assertEqual(config.poe_model, "deepseek-v4-flash")
        self.assertEqual(config.request_timeout_seconds, 60.0)
        self.assertEqual(config.scenario_request_timeout_seconds, 180.0)
        self.assertNotIn("api_key", config.public_dict())

    def test_client_values_are_bounded(self):
        with self.assertRaises(ValueError):
            ProviderConfig(request_timeout_seconds=0).validate()
        with self.assertRaises(ValueError):
            ProviderConfig(scenario_request_timeout_seconds=301).validate()


if __name__ == "__main__":
    unittest.main()
