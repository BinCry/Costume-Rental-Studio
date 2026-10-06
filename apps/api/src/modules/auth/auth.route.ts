import { Router } from 'express';

import { emailChangeRouter } from './email-change/email-change.route.js';
import { googleOAuthRouter } from './google/google-oauth.route.js';
import { passwordResetRouter } from './password-reset/password-reset.route.js';
import { registrationRouter } from './registration/registration.route.js';
import { sessionRouter } from './session/session.route.js';

export const authRouter = Router();

authRouter.use(registrationRouter);
authRouter.use(passwordResetRouter);
authRouter.use(emailChangeRouter);
authRouter.use(googleOAuthRouter);
authRouter.use(sessionRouter);
