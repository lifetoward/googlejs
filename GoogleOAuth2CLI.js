/**
 * Use this class to establish user-authorized access to Google APIs from a CLI.
 * It wraps the Google OAuth2 Client class (googleapis:google.auth.OAuth2) adding these helps:
 * 1. We persist creds and tokens in the Google Secret Manager following conventions.
 * 2. We include logic to obtain web-derived, Google user-specific tokens using the CLI/console
 *    and a web browser interaction.
 * 
 * Usage example accessing Google Sheets:
 * let gaxs = new GoogleOAuth2CLI('https://www.googleapis.com/auth/spreadsheets');
 * let sheets = google.sheets({ auth:gaxs.AuthClient });
 * sheets.spreadsheets.values.get({
 *    spreadsheetId:{SheetUID},
 *    range:'TabName!A2:E',
 * }, (error, response) => {
 *    if (err) throw `Failed to get values: ${err}`;
 *    const rows = response.data.values;
 *    // ... process returned values  
 * });
 */
module.exports = 
class GoogleOAuth2CLI
{
  /**
   * These metadata labels will be used to specify the kind, source, and usage of the secret(s)
   * stored in the Google Secret Manager.
   */
  static secretLabels = {
    scheme:'oauth2',
    context:'local-cli',
    format:'application/json',
    encoding:'utf8',
    usage:'api-client',
    tier:'dev',
    user:process.env.HOME,
    host:process.env.HOSTNAME,  
    created:'YYYYMMDD',
    expires:'YYYYMMDD',
  }

  /**
   * Ah but isn't it much better to just use the secrets service? Of course!
   * Load a secret with something like this:
   * 
   * You need to let the API locate the file containing the Service Account credentials.
   * There are 2 ways to do that: 
   *  1. Set GOOGLE_APPLICATION_CREDENTIALS to the name of the JSON file
   *  2. Pass the name of the JSON file into the client constructor as {keyFilename}
   * 
   * keyFilename = `${process.env.HOME}/.ssh/gc-dev.svcacct.json`
   * projectId = '535958686510'; // gchome
   * SecretID = 'local-integrity-guy-dev-oauth2-client'; // name of the secret object
   * 
   * const secrets = new (require('@google-cloud/secret-manager').SecretManagerServiceClient)({keyFilename});
   * secrets.accessSecretVersion({name:`projects/${projectId}/secrets/${SecretID}/versions/latest`})
   *  .then((out)=>JSON.parse(`${out[0].payload.data}`)) // data comes as Buffer... we put JSON in there
   *  .catch((err)=>{console.info(`Error ${err.code}:${err.details}`)});
   * 
   * This much is enough IF you:
   * 1. Manage these secrets using the Google Cloud Console.
   * 2. Stay within a single project where all these Secrets and Service Accounts reside.
   * 
   * To date, we've had trouble getting listSecrets to work due to permission errors, but 
   * we have successfully done getSecret() and getSecretVersion() for the metadata.
   */

  /**
   * GoogleOAuth2CLI facilitates the establishment and use of Google Auth tokens for access to Google APIs
   * according to their scopes. See https://developers.google.com/identity/protocols/oauth2/scopes .
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
      const fs = require('fs');
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

    ({google:{auth:{OAuth2:this.GOA2}}} = require('googleapis'));
    this.goa2 = new (this.GOA2)(this.ClientID, this.ClientSecret, this.RedirectUI);

    if (!this.Token) 
      this.Token = this.goa2.getNewTokenCLI();
    else
      this.goa2.setCredentials(this.Token);

    // That's it! With the token set for the client, we're ready to roll.
  }

  /**
   * Get and store a new token after prompting for user authorization.
   */
  getNewTokenCLI() 
  {
    const authUrl = this.goa2.generateAuthUrl({access_type:'offline', scope:this.Scopes});
    console.log(`Authorize this app by visiting: ${authUrl}`);
    const rl = require('readline').createInterface({input:process.stdin, output:process.stdout});
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      this.getToken(code, (err, token) => {
        if (err) return console.error('Error while trying to retrieve access token', err);
        this.goa2.setCredentials(this.Token = token);

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
