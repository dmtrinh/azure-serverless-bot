# Azure Serverless Bot

A DummyBot created to testdrive Microsoft Bot Framework.
The bot currently implements the following:
* A simple help menu
* A set of global action handlers
* Integration with Microsoft LUIS so it can have basic language understanding
The bot makes use of the ChatConnector which allows it to interface with a variety of channels including Skype.

## Deployment
1. Create a new Bot Service in Azure Portal
2. Open up the Application Settings blade and update the following:
* Update the MicrosoftAppId and MicrosoftAppPassword environment variables.  Use settings from your account @ https://dev.botframework.com/bots
* We will be using a prebuilt Cortana model.  Update the LuisAppId and LuisAPIKey with settings from your account @ https://www.luis.ai
