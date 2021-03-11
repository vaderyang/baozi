# Authentication Providers

A new auth provider can be added with the addition of a single file in this
folder, and (optionally) a matching logo in `/app/components/AuthLogo/index.js`
that will appear on the signin button.

Auth providers generally use [Passport](http://www.passportjs.org/) strategies,
although they can use any custom logic if needed. See the `google` auth provider for the cleanest example of what is required – some rules:

- The strategy name _must_ be lowercase
- The stragegy _must_ call the `accountProvisioner` command in the verify callback
- The auth file _must_ export a `config` object with `name` and `enabled` keys
