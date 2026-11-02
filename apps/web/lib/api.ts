import {
  type AddStylePhotoInput,
  type CaptureProblemBody,
  type ChangeEmailInput,
  type ConfirmEmailChangeInput,
  type ConsentRequest,
  type CreateProfileInput,
  type CreateStyleRequestInput,
  type CreateStyleUploadsInput,
  type CreateSnapshotInput,
  type CreateUploadsInput,
  type LinkToken,
  type LoginInput,
  type Me,
  type NewRecoveryCodesInput,
  type NotificationSettings,
  type Preferences,
  type Profile,
  type PushKey,
  type RecoverAccountInput,
  type RecoveryCodes,
  type RegisterInput,
  type ResetPasswordInput,
  type EmailLinkRequest,
  type ReflectionCreated,
  type SaveNotificationsInput,
  type ShareCreated,
  type RunView,
  type StylePhotoView,
  type StyleRequestCreated,
  type StyleUploadsResponse,
  type UploadsResponse,
  type WordsView,
  type AssistantRequest,
  type AssistantReply,
  assistantReplySchema,
  captureProblemBodySchema,
  meSchema,
  notificationSettingsSchema,
  preferencesSchema,
  profileSchema,
  pushKeySchema,
  recoveryCodesSchema,
  reflectionCreatedSchema,
  shareCreatedSchema,
  runViewSchema,
  snapshotCreatedSchema,
  stylePhotoViewSchema,
  styleRequestCreatedSchema,
  styleUploadsResponseSchema,
  uploadsResponseSchema,
  wordsViewSchema,
} from '@interim/types';

/** Interprets a consented question; never starts a photo run or performs an action. */
export async function askAboutCard(
  cardId: string,
  input: AssistantRequest,
): Promise<AssistantReply> {
  return assistantReplySchema.parse(
    await (await send(`/cards/${encodeURIComponent(cardId)}/assistant`, 'POST', input)).json(),
  );
}

/**
 * A failed call to the API. `status` is `'network'` when no response arrived at all. `problem` is
 * set when the API refused a photo or an answer and said which, so the screen can say it in the
 * person's language.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number | 'network',
    message: string,
    readonly problem?: CaptureProblemBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Everything goes through `/api/*`, which the web server forwards to the API, so the owner cookie
// is set on this origin. Responses are parsed here, at the boundary.
async function send(path: string, method: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Could not reach the API');
  }
  if (!response.ok) {
    const problem = captureProblemBodySchema.safeParse(
      await response.json().catch(() => undefined),
    );
    throw new ApiError(
      response.status,
      `The API answered ${response.status}`,
      problem.success ? problem.data : undefined,
    );
  }
  return response;
}

/** Starts a profile. The API sets the owner cookie on the first one. */
export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  return profileSchema.parse(await (await send('/profiles', 'POST', input)).json());
}

/** The profile's companion settings. */
export async function getPreferences(id: string): Promise<Preferences> {
  return preferencesSchema.parse(await (await send(`/profiles/${id}/preferences`, 'GET')).json());
}

/**
 * Today's words for the profile.
 * @param date The person's local date as YYYY-MM-DD.
 */
export async function getWords(id: string, date: string): Promise<WordsView> {
  return wordsViewSchema.parse(
    await (await send(`/profiles/${id}/words?date=${date}`, 'GET')).json(),
  );
}

/** Replaces the profile's companion settings. */
export async function savePreferences(id: string, preferences: Preferences): Promise<void> {
  await send(`/profiles/${id}/preferences`, 'PUT', preferences);
}

/** The key this browser subscribes to push with, or null while the server has none. */
export async function getPushKey(): Promise<PushKey> {
  return pushKeySchema.parse(await (await send('/notifications/key', 'GET')).json());
}

/** The notification choices saved for one device. */
export async function getNotifications(
  id: string,
  endpoint: string,
): Promise<NotificationSettings> {
  return notificationSettingsSchema.parse(
    await (
      await send(`/profiles/${id}/notifications?endpoint=${encodeURIComponent(endpoint)}`, 'GET')
    ).json(),
  );
}

/** Saves one device's notification choices. With both kinds off the server forgets the device. */
export async function saveNotifications(
  id: string,
  input: SaveNotificationsInput,
): Promise<NotificationSettings> {
  return notificationSettingsSchema.parse(
    await (await send(`/profiles/${id}/notifications`, 'PUT', input)).json(),
  );
}

/** Records the person's consent. */
export async function grantConsent(id: string, consent: ConsentRequest): Promise<void> {
  await send(`/profiles/${id}/consent`, 'POST', consent);
}

/** Deletes the profile and everything under it. */
export async function deleteProfile(id: string): Promise<void> {
  await send(`/profiles/${id}`, 'DELETE');
}

/** Creates an account and emails a link to confirm it. The answer is the same for an address that already has one. */
export async function register(input: RegisterInput): Promise<void> {
  await send('/auth/register', 'POST', input);
}

/** Signs in with email and password. */
export async function login(input: LoginInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/login', 'POST', input)).json());
}

/** Emails a sign-in link. The answer is the same whether or not the address has an account. */
export async function requestMagicLink(input: EmailLinkRequest): Promise<void> {
  await send('/auth/magic', 'POST', input);
}

/** Signs in with the token from an emailed link. */
export async function signInWithLink(input: LinkToken): Promise<Me> {
  return meSchema.parse(await (await send('/auth/magic/use', 'POST', input)).json());
}

/** Confirms an email address with the token from the link sent at sign up, and signs in. */
export async function confirmEmail(input: LinkToken): Promise<Me> {
  return meSchema.parse(await (await send('/auth/verify-email', 'POST', input)).json());
}

/** Emails a password reset link. The answer is the same whether or not the address has an account. */
export async function requestPasswordReset(input: EmailLinkRequest): Promise<void> {
  await send('/auth/password/forgot', 'POST', input);
}

/** Sets a new password from an emailed link, and signs in. */
export async function resetPassword(input: ResetPasswordInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/password/reset', 'POST', input)).json());
}

/** Emails a link to the new address. The email changes only when that link is used. The password is needed when the account has one. */
export async function requestEmailChange(input: ChangeEmailInput): Promise<void> {
  await send('/auth/email/change', 'POST', input);
}

/** Moves the account to the new address with the token from the emailed link, and signs in. */
export async function confirmEmailChange(input: ConfirmEmailChangeInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/email/confirm', 'POST', input)).json());
}

/** Starts recovery with a recovery code and a new address. The answer is the same whether or not the details were right. */
export async function recoverAccount(input: RecoverAccountInput): Promise<void> {
  await send('/auth/recover', 'POST', input);
}

/** Finishes recovery with the token from the link sent to the new address, and signs in. */
export async function confirmRecovery(input: ConfirmEmailChangeInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/recover/confirm', 'POST', input)).json());
}

/** Makes a new set of recovery codes, replacing the old. They are returned once and cannot be read again. */
export async function createRecoveryCodes(input: NewRecoveryCodesInput): Promise<RecoveryCodes> {
  return recoveryCodesSchema.parse(
    await (await send('/auth/recovery-codes', 'POST', input)).json(),
  );
}

/** Signs this browser out. */
export async function logout(): Promise<void> {
  await send('/auth/logout', 'POST');
}

/** Deletes the account and everything in it. The password is needed when the account has one. */
export async function deleteAccount(password?: string): Promise<void> {
  await send('/auth/account', 'DELETE', { password });
}

/** Asks for one upload link per photo. */
export async function createUploads(
  profileId: string,
  input: CreateUploadsInput,
): Promise<UploadsResponse> {
  return uploadsResponseSchema.parse(
    await (await send(`/profiles/${profileId}/uploads`, 'POST', input)).json(),
  );
}

/** Asks for one upload link per style photo. */
export async function createStyleUploads(
  profileId: string,
  input: CreateStyleUploadsInput,
): Promise<StyleUploadsResponse> {
  return styleUploadsResponseSchema.parse(
    await (await send(`/profiles/${profileId}/style/uploads`, 'POST', input)).json(),
  );
}

/** Stores an uploaded file as a reference or current photo. The same picture twice returns the first. */
export async function addStylePhoto(profileId: string, input: AddStylePhotoInput): Promise<StylePhotoView> {
  return stylePhotoViewSchema.parse(
    await (await send(`/profiles/${profileId}/style/photos`, 'POST', input)).json(),
  );
}

/** Deletes a style photo and the previews made from it. */
export async function deleteStylePhoto(profileId: string, photoId: string): Promise<void> {
  await send(`/profiles/${profileId}/style/photos/${photoId}`, 'DELETE');
}

/** Starts previews of one to three references on the current photo. */
export async function createStyleRequest(
  profileId: string,
  input: CreateStyleRequestInput,
): Promise<StyleRequestCreated> {
  return styleRequestCreatedSchema.parse(
    await (await send(`/profiles/${profileId}/style/requests`, 'POST', input)).json(),
  );
}

/** Saves a preview, or takes it off the saved list. */
export async function setStylePreviewSaved(previewId: string, saved: boolean): Promise<void> {
  await send(`/style/previews/${previewId}/saved`, saved ? 'PUT' : 'DELETE');
}

/** Sends a photo straight to storage on a link from `createUploads`. The bytes never pass through the API. */
export async function putPhoto(url: string, photo: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: 'PUT', body: photo });
  } catch {
    throw new ApiError('network', 'Could not reach storage');
  }
  if (!response.ok) throw new ApiError(response.status, `Storage answered ${response.status}`);
}

/** Stores a snapshot from uploaded photos and the check in answers. Returns its id. */
export async function createSnapshot(
  profileId: string,
  input: CreateSnapshotInput,
): Promise<string> {
  return snapshotCreatedSchema.parse(
    await (await send(`/profiles/${profileId}/snapshots`, 'POST', input)).json(),
  ).id;
}

/** Starts the agent for a snapshot. Starting it again returns the same run. */
export async function startRun(snapshotId: string): Promise<RunView> {
  return runViewSchema.parse(await (await send(`/snapshots/${snapshotId}/runs`, 'POST')).json());
}

/** Approves a card. */
export async function approveCard(cardId: string): Promise<void> {
  await send(`/cards/${cardId}/approve`, 'POST');
}

/** Makes a share link for a card. The token comes back once. */
export async function createShare(cardId: string): Promise<ShareCreated> {
  return shareCreatedSchema.parse(await (await send(`/cards/${cardId}/share`, 'POST')).json());
}

/** Stops a share link working. */
export async function revokeShare(shareId: string): Promise<void> {
  await send(`/shares/${shareId}`, 'DELETE');
}

/** A run's progress, for when the live stream is not available. */
export async function fetchRun(runId: string): Promise<RunView> {
  return runViewSchema.parse(await (await send(`/runs/${runId}`, 'GET')).json());
}

/** Saves a reflection. The answer says whether the contacts card should show. */
export async function saveReflection(profileId: string, text: string): Promise<ReflectionCreated> {
  return reflectionCreatedSchema.parse(
    await (await send(`/profiles/${profileId}/reflections`, 'POST', { text })).json(),
  );
}

/** Deletes one reflection. */
export async function deleteReflection(profileId: string, reflectionId: string): Promise<void> {
  await send(`/profiles/${profileId}/reflections/${reflectionId}`, 'DELETE');
}

/** Closes the contacts card until a later reflection is flagged. */
export async function dismissContacts(profileId: string): Promise<void> {
  await send(`/profiles/${profileId}/reflections/contacts/dismiss`, 'POST');
}

/** Saves a catalog piece, to be shown on the person's photo at each check in. Saving it again changes nothing. */
export async function saveGarment(profileId: string, sku: string): Promise<void> {
  await send(`/profiles/${profileId}/garments/${encodeURIComponent(sku)}`, 'PUT');
}

/** Removes a saved piece. */
export async function removeGarment(profileId: string, sku: string): Promise<void> {
  await send(`/profiles/${profileId}/garments/${encodeURIComponent(sku)}`, 'DELETE');
}
