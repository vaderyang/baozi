# Azure AD (Microsoft Entra ID) Authentication Setup Guide

This guide walks you through configuring Azure AD authentication for your Outline instance.

## Prerequisites

- An Azure account with permissions to create App Registrations
- Access to Azure Portal (https://portal.azure.com)
- Your Outline instance URL (e.g., `http://local.outline.dev:3030`)

## Overview

Azure AD authentication allows users to sign in to Outline using their Microsoft/organizational accounts. This is ideal for organizations already using Microsoft 365 or Azure AD for identity management.

## Step 1: Create an App Registration in Azure Portal

1. **Navigate to Azure Portal**
   - Go to https://portal.azure.com
   - Sign in with your Azure account

2. **Access App Registrations**
   - Click on "Azure Active Directory" (or "Microsoft Entra ID" in newer interfaces)
   - In the left sidebar, click "App registrations"
   - Click "New registration"

3. **Configure the Application**
   - **Name**: Enter a descriptive name (e.g., "Outline Knowledge Base")
   - **Supported account types**: Choose based on your needs:
     - `Accounts in this organizational directory only` - Single tenant (recommended for most organizations)
     - `Accounts in any organizational directory` - Multi-tenant
     - `Accounts in any organizational directory and personal Microsoft accounts` - Multi-tenant + personal accounts
   - **Redirect URI**:
     - Platform: `Web`
     - URI: `http://local.outline.dev:3030/auth/azure.callback`
     - For production: `https://your-domain.com/auth/azure.callback`
   - Click "Register"

## Step 2: Obtain Application Credentials

1. **Get the Application (client) ID**
   - After registration, you'll see the "Overview" page
   - Copy the **Application (client) ID** (looks like: `12345678-1234-1234-1234-123456789abc`)
   - This is your `AZURE_CLIENT_ID`

2. **Get the Directory (tenant) ID**
   - On the same "Overview" page
   - Copy the **Directory (tenant) ID** (looks like: `87654321-4321-4321-4321-cba987654321`)
   - This will be used to construct your `AZURE_RESOURCE_APP_ID`

3. **Create a Client Secret**
   - In the left sidebar, click "Certificates & secrets"
   - Click "New client secret"
   - **Description**: Enter a description (e.g., "Outline production secret")
   - **Expires**: Choose an expiration period (recommended: 24 months)
   - Click "Add"
   - **IMPORTANT**: Copy the **Value** immediately (it won't be shown again!)
   - This is your `AZURE_CLIENT_SECRET`

## Step 3: Configure API Permissions

1. **Add Required Permissions**
   - In the left sidebar, click "API permissions"
   - The default `User.Read` permission should already be present
   - If not, click "Add a permission" → "Microsoft Graph" → "Delegated permissions"
   - Add the following permissions:
     - `User.Read` - Sign in and read user profile
     - `email` - View users' email address
     - `openid` - Sign users in
     - `profile` - View users' basic profile

2. **Grant Admin Consent** (if required by your organization)
   - Click "Grant admin consent for [Your Organization]"
   - Confirm the action

## Step 4: Configure Authentication Settings

1. **Configure Token Settings**
   - In the left sidebar, click "Authentication"
   - Under "Implicit grant and hybrid flows":
     - Check "ID tokens" (used for user sign-in)
   - Under "Advanced settings":
     - Set "Allow public client flows" to `No`
   - Click "Save"

2. **Add Additional Redirect URIs** (if needed)
   - In the same "Authentication" section
   - Under "Web" → "Redirect URIs"
   - Add additional URIs for different environments:
     - Development: `http://local.outline.dev:3030/auth/azure.callback`
     - Staging: `https://staging.yourdomain.com/auth/azure.callback`
     - Production: `https://yourdomain.com/auth/azure.callback`

## Step 5: Update Outline Environment Variables

Add the following to your `.env` file:

```bash
# Microsoft Azure AD Authentication
AZURE_CLIENT_ID=12345678-1234-1234-1234-123456789abc
AZURE_CLIENT_SECRET=your_client_secret_value_here
AZURE_RESOURCE_APP_ID=api://12345678-1234-1234-1234-123456789abc
```

### Understanding AZURE_RESOURCE_APP_ID

The `AZURE_RESOURCE_APP_ID` should be in the format: `api://{AZURE_CLIENT_ID}`

For example:
- If your `AZURE_CLIENT_ID` is `12345678-1234-1234-1234-123456789abc`
- Then `AZURE_RESOURCE_APP_ID` should be `api://12345678-1234-1234-1234-123456789abc`

Alternatively, you can use the Application ID URI from Azure Portal:
- Go to "Expose an API" in your App Registration
- Copy the "Application ID URI" (default is `api://{client-id}`)

## Step 6: Test the Configuration

1. **Start your services**
   ```bash
   # Start PostgreSQL and Redis
   docker-compose up -d

   # Start Outline
   yarn dev
   ```

2. **Access Outline**
   - Navigate to `http://local.outline.dev:3030`
   - You should see "Sign in with Microsoft" option
   - Click it to test the authentication flow

3. **Verify Sign-In**
   - You'll be redirected to Microsoft login page
   - Enter your credentials
   - Grant permissions if prompted
   - You should be redirected back to Outline and signed in

## Common Issues and Troubleshooting

### Issue 1: Redirect URI Mismatch
**Error**: `AADSTS50011: The redirect URI specified in the request does not match the redirect URIs configured for the application.`

**Solution**:
- Ensure the redirect URI in Azure Portal exactly matches your Outline URL
- Format: `{YOUR_URL}/auth/azure.callback`
- No trailing slashes
- Protocol must match (http vs https)

### Issue 2: Invalid Client Secret
**Error**: `AADSTS7000215: Invalid client secret provided.`

**Solution**:
- Verify you copied the client secret **value**, not the secret ID
- Client secrets expire - check expiration date and create a new one if needed
- Ensure no extra spaces or characters when pasting

### Issue 3: Insufficient Permissions
**Error**: User can't sign in or gets permission errors

**Solution**:
- Verify all required API permissions are added
- Grant admin consent if required by your organization
- Check that "ID tokens" is enabled in Authentication settings

### Issue 4: Multi-Tenant Configuration
**Error**: Users from other organizations can't sign in

**Solution**:
- Check "Supported account types" in your App Registration
- Change to "Accounts in any organizational directory" if you need multi-tenant support
- Update and save the configuration

### Issue 5: localhost vs local.outline.dev
**Error**: Authentication callback fails with URL mismatch

**Solution**:
- Add `local.outline.dev` to your `/etc/hosts` file:
  ```bash
  echo "127.0.0.1 local.outline.dev" | sudo tee -a /etc/hosts
  ```
- Or use `http://localhost:3030` and update Azure redirect URI accordingly

## Security Best Practices

1. **Client Secret Management**
   - Store secrets securely (use environment variables, not hardcoded)
   - Rotate secrets regularly (before expiration)
   - Never commit secrets to version control
   - Use different secrets for different environments

2. **Redirect URI Configuration**
   - Only add redirect URIs you actually use
   - Use HTTPS in production
   - Avoid wildcard URIs

3. **Permissions**
   - Only request the minimum permissions needed
   - Review permissions periodically
   - Remove unused permissions

4. **Monitoring**
   - Enable sign-in logs in Azure AD
   - Monitor for suspicious authentication attempts
   - Set up alerts for failed authentication attempts

## Advanced Configuration

### Restricting Access to Specific Users/Groups

1. In Azure Portal, go to your App Registration
2. Click on "Enterprise applications" in Azure AD
3. Find and click on your application
4. Go to "Properties"
5. Set "User assignment required?" to `Yes`
6. Go to "Users and groups"
7. Add specific users or groups who should have access

### Custom Branding

1. In your App Registration, go to "Branding & properties"
2. Add a logo, terms of service URL, and privacy statement URL
3. These will be shown during the consent process

### Conditional Access Policies

1. In Azure AD, go to "Security" → "Conditional Access"
2. Create policies to enforce MFA, device compliance, or location-based access
3. Apply policies to your Outline application

## Testing Checklist

- [ ] Azure App Registration created
- [ ] Client ID copied to `.env`
- [ ] Client secret created and copied to `.env`
- [ ] Resource App ID configured in `.env`
- [ ] Redirect URI added in Azure Portal
- [ ] API permissions configured
- [ ] Admin consent granted (if required)
- [ ] PostgreSQL and Redis running via Docker
- [ ] Outline application started
- [ ] Can access sign-in page
- [ ] "Sign in with Microsoft" button appears
- [ ] Can complete authentication flow
- [ ] Successfully signed in to Outline

## References

- [Microsoft Entra ID Documentation](https://learn.microsoft.com/en-us/azure/active-directory/)
- [Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Outline Official Documentation](https://docs.getoutline.com/s/hosting/doc/microsoft-entra-UVz6jsIOcv)

## Support

If you encounter issues not covered in this guide:

1. Check Outline logs for detailed error messages
2. Review Azure AD sign-in logs in Azure Portal
3. Consult the [Outline GitHub Discussions](https://github.com/outline/outline/discussions)
4. Verify your configuration against the `.env.sample` file

## Configuration Summary

Here's a quick reference for your `.env` file:

```bash
# Microsoft Azure AD Authentication
AZURE_CLIENT_ID=your_application_client_id
AZURE_CLIENT_SECRET=your_client_secret_value
AZURE_RESOURCE_APP_ID=api://your_application_client_id
```

Replace the placeholder values with your actual credentials from Azure Portal.
