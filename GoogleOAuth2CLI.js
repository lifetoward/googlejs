/**
 * Use this class to establish authorized access to Google APIs from a CLI.
 * It extends the Google OAuth2 Client class (google.auth.OAuth2) and adds these helps:
 * 1. We persist creds and tokens in the filesystem using a flexible locating convention.
 * 2. We include logic to obtain web-derived, Google user-specific tokens using the CLI/console
 *    and a web browser interaction.
 * 
 * Usage example:
 * let gaxs = new GoogleOAuth2CLI('https://www.googleapis.com/auth/spreadsheets');
 * let sheets = google.sheets({ version:'v4', gaxs });
 * sheets.spreadsheets.values.get({
 *    spreadsheetId:{SheetUID},
 *    range:'TabName!A2:E',
 * }, (error, response) => {
 *    if (err) throw `Failed to get values: ${err}`;
 *    const rows = response.data.values;
 *    // ... process returned values  
 * });
 */
const {google:{auth:{OAuth2:GOA2}}} = require('googleapis');

class GoogleOAuth2CLI extends GOA2
{
  /**
   * GoogleAuthCLI facilitates the establishment and use of Google Auth tokens for access to Google APIs
   * within their defined scopes. See https://developers.google.com/identity/protocols/oauth2/scopes .
   * We presume a CLI console context by which to obtain or confirm permission decisions.
   * @param {Array|String} scopes Single or list of established authorization scope URI strings
   * @param {String} creds (optional):
   *    Pass a directory to indicate where creds and token files should be located.
   *    Passing null equates to passing the current working directory.
   *    If the passed string is not a directory we treat it as a filename prefix. 
   *    The filenames used are like: [{directory}/|{prefix}_][token|creds].json
   * @throws {Error} We throw an Error if we fail to:
   *    0. Understand the scopes passed
   *    1. Access the credentials information
   *    2. Authorize the requested scopes
   *    3. Write the tokens we obtain to the filesystem (persist for future use) 
   */
  constructor( scopes, creds = null ) 
  {
    this.Scopes = scopes;
    
    // This logic identifies the token and creds file locations we'll use.
    if (creds === null || creds instanceof String) {

      let prefix = './';
      let fs = require('fs');
      if (creds) {
        if (fs.statSync(creds).isDirectory()) {
          // When provided a directory we use standard file names there
          prefix = creds+'/';
        } else {
          // When provided other than a directory, we assume we've been given a
          // path+prefix, so we check whether `${creds}_creds.json` exists.
          let fn = creds+'_creds.json';
          if (fs.accessSync(fn, fs.constants.R_OK)) {
            prefix = creds+'_';
          } else {
            throw new Error(`Can't access "${fn}" to obtain access credentials.`)
          }
        }
      } 
      this.CredsPath = prefix+'creds.json';
      this.TokenPath = prefix+'token.json';

      ( // load up essential properties from the creds file 
        {client_id:this.ClientID, client_secret:this.ClientSecret, redirect_uris:[RedirectURI]} = 
          JSON.parse(fs.readFileSync(this.CredsPath)).installed 
      );

      // Now load up a persisted token if it exists
      try { this.Token = JSON.parse(fs.readFileSync(this.TokenPath)) }
      catch (e) { this.Token = null }
  
    } else throw new Error(`Invalid creds parameter.`)

    super(this.ClientID, this.ClientSecret, this.RedirectUI);

    if (!this.Token) 
      this.Token = this.getNewTokenCLI();
    else
      this.setCredentials(this.Token);

    // That's it! With the token set for the client, we're ready to roll.
  }

  /**
   * Get and store a new token after prompting for user authorization.
   */
  getNewTokenCLI() 
  {
    const authUrl = this.generateAuthUrl({access_type:'offline', scope:this.Scopes});
    console.log(`Authorize this app by visiting: ${authUrl}`);
    const rl = require('readline').createInterface({input:process.stdin, output:process.stdout});
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      this.getToken(code, (err, token) => {
        if (err) return console.error('Error while trying to retrieve access token', err);
        this.setCredentials(this.Token = token);

        // Store the token to disk for later program executions
        if (this.TokenPath) {
          require('fs').writeFile(this.TokenPath, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log('Token stored to', this.TokenPath);
          });
        }
      });
    });
  }

} // GoogleOAuth2CLI class

module.export(GoogleOAuth2CLI);
