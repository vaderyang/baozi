// @flow
require("dotenv").config({ silent: true });

// If the DataDog agent is installed and the DD_API_KEY environment variable is
// in the environment then we can safely attempt to start the DD tracer
if (process.env.DD_API_KEY) {
  require("dd-trace").init({
    // SOURCE_COMMIT is used by Docker Hub
    // SOURCE_VERSION is used by Heroku
    version: process.env.SOURCE_COMMIT || process.env.SOURCE_VERSION,
  });
}

if (
  !process.env.SECRET_KEY ||
  process.env.SECRET_KEY === "generate_a_new_key"
) {
  console.error(
    "The SECRET_KEY env variable must be set with the output of `openssl rand -hex 32`"
  );
  process.exit(1);
}

if (process.env.AWS_ACCESS_KEY_ID) {
  [
    "AWS_REGION",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_UPLOAD_BUCKET_URL",
    "AWS_S3_UPLOAD_MAX_SIZE",
  ].forEach((key) => {
    if (!process.env[key]) {
      console.error(`The ${key} env variable must be set when using AWS`);
      process.exit(1);
    }
  });
}

if (process.env.SLACK_KEY) {
  if (!process.env.SLACK_SECRET) {
    console.error(
      `The SLACK_SECRET env variable must be set when using Slack Sign In`
    );
    process.exit(1);
  }
}

if (!process.env.URL) {
  console.error(
    "The URL env variable must be set to the externally accessible URL, e.g (https://www.getoutline.com)"
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "The DATABASE_URL env variable must be set to the location of your postgres server, including authentication and port"
  );
  process.exit(1);
}

if (!process.env.REDIS_URL) {
  console.error(
    "The REDIS_URL env variable must be set to the location of your redis server, including authentication and port"
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.log("\n\x1b[33m%s\x1b[0m", "Running Outline in production mode.");
} else if (process.env.NODE_ENV === "development") {
  console.log(
    "\n\x1b[33m%s\x1b[0m",
    'Running Outline in development mode with hot reloading. To run Outline in production mode set the NODE_ENV env variable to "production"'
  );
}

require("./main");
