"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");

// image caption bot
var captionService = require('./caption-service');
// var needle = require('needle');
var restify = require('restify');
var url = require('url');
var validUrl = require('valid-url');

var useEmulator = (process.env.NODE_ENV == 'development');

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

var bot = new builder.UniversalBot(connector);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'api.projectoxford.ai';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;

// Create LUIS recognizer that points at our model
var recognizer = new builder.LuisRecognizer(LuisModelUrl);

bot.endConversationAction('goodbye', 'Goodbye :)', { matches: /^goodbye/i });
bot.beginDialogAction('help', '/help', { matches: /^help/i });

bot.dialog('/', [
    function (session) {
        // Send a greeting and show help.
        var card = new builder.HeroCard(session)
            .title("NotTooDumbBot")
            .text("beep beep beeeeeeeeeeep!")
            .images([
                 builder.CardImage.create(session, 
                 "http://tfwiki.net/mediawiki/images2/thumb/f/fe/Symbol_autobot_reg.png/120px-Symbol_autobot_reg.png")
            ]);
        var msg = new builder.Message(session).attachments([card]);
        session.send(msg);
        session.beginDialog('/help');
    },
    function (session, results) {
        // Display menu
        session.beginDialog('/menu');
    },
    function (session, results) {
        // When does this actually get called?!
        session.send("Hasta la vista!");
    }
]);

bot.dialog('/help', [
    function (session) {
        session.endDialog("== HELP BOX ==\n\n" +
            "Global commands that can be invoked anytime:\n" +
            "* menu - Display main menu\n" +
            "* quit - Quit the current conversation\n" +
            "* help - Bring up this help box"
        );
    }
]);

bot.dialog('/menu', [
    function (session) {
        builder.Prompts.choice(session, "Choose an option:", "LUIS|Vision|(quit)");
    },
    function (session, results) {
        if (results.response && results.response.entity != '(quit)') {
            if (results.response.entity == 'LUIS')
                session.send("LUIS testdrive... start chatting with the bot!");
            else if (results.response.entity == 'Vision') 
                session.send("Vision testdrive... send the bot an image or URL to an image!");
            session.beginDialog('/' + results.response.entity);
        } else {
            // Exit the menu
            session.endDialog();
        }
    },
    function (session, results) {
        // The menu runs a loop until the user chooses to (quit).
        session.replaceDialog('/menu');
    }
]).reloadAction('reloadMenu', null, { matches: /^menu|show menu/i });

var intents = new builder.IntentDialog({ recognizers: [recognizer] })
.matches('builtin.intent.places.show_map',
    function (session, args, next) {
        // Resolve entities passed from LUIS.
        session.send("I think you are trying to find where you are...");
        session.send("Unfortunately, Ducmeister has not taught me how to call Google Maps yet to bring back some results for you.");
    }
)
.matches('builtin.intent.places.find_place', [
    function (session, args, next) {
        session.send("I think you are searching for one or more places...");
        // Resolve and store any entities passed from LUIS.
        var place_type = builder.EntityRecognizer.findEntity(args.entities, 'builtin.places.place_type');
        session.send("\ttype of place: %s", place_type != null ? place_type.entity : "Unknown");
        session.send("Unfortunately, Ducmeister has not taught me how to call Google yet to bring back some results for you.");
    }
])
.matches('builtin.intent.weather.check_weather', [
    function (session, args, next) {
        session.send("I think you are trying to check the weather...");
        // Resolve and store any entities passed from LUIS.
        var place_type = builder.EntityRecognizer.findEntity(args.entities, 'builtin.weather.absolute_location');
        session.send("\ttype of place: %s", place_type != null ? place_type.entity : "None provided...  Assuming your current location.");
        var date_range = builder.EntityRecognizer.findEntity(args.entities, 'builtin.weather.date_range');
        session.send("\tdate(s): %s", date_range != null ? date_range.entity : "None provided.");
        session.send("Unfortunately, Ducmeister has not taught me how to call Weather Underground yet to bring back some results for you.");
        next();
    },
    function (session, results) {
        session.send("=== end waterfall.");
    }
])
.matches(/\b(quit|end|exit)\b/i,
    function (session, args, next) {
        // Resolve entities passed from LUIS.
        session.endDialog("OK... exiting LUIS testdrive!");
    }
)
.onDefault([
    function (session, args, next) {
        session.send("You said: %s", session.message.text);
        session.send("I'm sorry, I don't know how to handle this yet. " +
            "Ducmeister only taught me a couple conversation skills so far. " +
            "Try asking about something useless like the weather or for a location.  LOL"
        );
    }
]);

bot.dialog('/LUIS', intents);

bot.dialog('/Vision', session => {
    if (hasImageAttachment(session)) {
        var stream = getImageStreamFromUrl(session.message.attachments[0]);
        captionService
            .getCaptionFromStream(stream)
            .then(caption => handleSuccessResponse(session, caption))
            .catch(error => handleErrorResponse(session, error));
    } else {
        var imageUrl = parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text) ? session.message.text : null);
        if (imageUrl) {
            captionService
                .getCaptionFromUrl(imageUrl)
                .then(caption => handleSuccessResponse(session, caption))
                .catch(error => handleErrorResponse(session, error));
        } else {
            session.send('Did you upload an image? I\'m more of a visual person. Try sending me an image or an image URL');
        }
    }
});

//=========================================================
// Utilities
//=========================================================
const hasImageAttachment = session => {
    return session.message.attachments.length > 0 &&
        session.message.attachments[0].contentType.indexOf('image') !== -1;
};

const getImageStreamFromUrl = attachment => {
    var headers = {};
    if (isSkypeAttachment(attachment)) {
        // The Skype attachment URLs are secured by JwtToken,
        // you should set the JwtToken of your bot as the authorization header for the GET request your bot initiates to fetch the image.
        // https://github.com/Microsoft/BotBuilder/issues/662
        connector.getAccessToken((error, token) => {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, { headers: headers });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    return needle.get(attachment.contentUrl, { headers: headers });
};

const isSkypeAttachment = attachment => {
    return url.parse(attachment.contentUrl).hostname.substr(-'skype.com'.length) === 'skype.com';
};

/**
 * Gets the href value in an anchor element.
 * Skype transforms raw urls to html. Here we extract the href value from the url
 * @param {string} input Anchor Tag
 * @return {string} Url matched or null
 */
const parseAnchorTag = input => {
    var match = input.match('^<a href=\"([^\"]*)\">[^<]*</a>$');
    if (match && match[1]) {
        return match[1];
    }

    return null;
};

//=========================================================
// Response Handling
//=========================================================
const handleSuccessResponse = (session, caption) => {
    if (caption) {
        session.send('I think it\'s ' + caption);
    }
    else {
        session.send('Couldn\'t find a caption for this one');
    }

};

const handleErrorResponse = (session, error) => {
    session.send('Oops! Something went wrong. Try again later.');
    console.error(error);
};

if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());    
} else {
    module.exports = { default: connector.listen() }
}
