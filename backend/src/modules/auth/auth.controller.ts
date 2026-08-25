import type { Request, Response } from 'express';
import { changePasswordSchema, loginSchema } from '@app/shared';
import { sendSuccess } from '../../utils/http';
import { parsedBody } from '../../middleware/validate';
import { getAuth } from '../../middleware/authenticate';
import * as authService from './auth.service';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './token.service';

const clientContext = (req: Request) => ({
  ip: req.ip,
  userAgent: req.header('user-agent') ?? undefined,
});

export const login = async (req: Request, res: Response): Promise<void> => {
  const input = parsedBody(req, loginSchema);
  const session = await authService.login(input, clientContext(req));

  setAuthCookies(res, session.accessToken, session.refreshToken);
  sendSuccess(res, { user: session.user });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

  try {
    const session = await authService.refresh(token, clientContext(req));
    setAuthCookies(res, session.accessToken, session.refreshToken);
    sendSuccess(res, { user: session.user });
  } catch (error) {
    /* A refresh that fails leaves no usable session — clear the cookies so the
       browser stops presenting a token the server has already rejected. */
    clearAuthCookies(res);
    throw error;
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  await authService.logout(token, req.auth?.userId);
  clearAuthCookies(res);
  sendSuccess(res, { loggedOut: true });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  sendSuccess(res, { user: await authService.getCurrentUser(auth.userId) });
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const input = parsedBody(req, changePasswordSchema);

  await authService.changePassword(auth.userId, input);

  /* Every session, including this one, was just invalidated. */
  clearAuthCookies(res);
  sendSuccess(res, { passwordChanged: true, signInAgain: true });
};
