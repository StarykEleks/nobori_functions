import * as path from 'path';
import * as process from 'node:process';

export const getCredentialsKeyFilename = () =>
  path.join(process.cwd(), 'serviceAccount.json');

export const getProjectId: () => string = () =>
  `${process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID}`;

export const getServiceAccountEmail: () => string = () =>
  'nobori-d1@appspot.gserviceaccount.com';
