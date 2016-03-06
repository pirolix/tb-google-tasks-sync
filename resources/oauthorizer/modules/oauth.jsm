
var EXPORTED_SYMBOLS = ["OAuth", "hex_sha1", "b64_sha1", "str_sha1", "hex_hmac_sha1", "b64_hmac_sha1", "str_hmac_sha1"];

Components.utils.import("resource:///modules/Services.jsm");

Services.scriptloader.loadSubScript("resource://oauthorizer/oauth/sha1.js", this);
Services.scriptloader.loadSubScript("resource://oauthorizer/oauth/oauth.js", this);

OAuth.SignatureMethod.registerMethodClass(["HMAC-SHA1", "HMAC-SHA1-Accessor"],
    OAuth.SignatureMethod.makeSubclass(
        function getSignature(baseString) {
            b64pad = '=';
            var signature = b64_hmac_sha1(this.key, baseString) + "=";
            return signature;
        }
    ));
