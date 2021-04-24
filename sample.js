
const scopes = 'https://www.googleapis.com/auth/spreadsheets';

// This auth expects envvar GOOGLE_APPLICATION_CREDENTIALS={pathname of Service Account creds} 
// And you need to grant that service account due privileges to the resources you're accessing
const auth = (new (require('google-auth-library').GoogleAuth)({scopes})).getClient();

const sheetsAPI = require('googleapis').google.sheets({version:'v4',auth});

let request = { spreadsheetId:'1a0utkUppwAOeNdbUuKT9RZW2X5EQyaPxrJSS7rvRvlE' };

request.range = 'A1:M50';

sheetsAPI.spreadsheets.get(request)
    .then((out)=>console.log(`${out.data}`))
    .catch((err)=>console.log(`${err.code}:${err.message}`))

/**
var googleAuth = require('google-auth-library');
var auth = new googleAuth();
var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
oauth2Client.credentials = credentials;
*/