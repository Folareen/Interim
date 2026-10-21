import { youcamErrorCodeSchema, type YoucamErrorCode } from '@interim/types';

// Transport and policy failures. Task failures reported inside an HTTP 200 are not thrown;
// getTask returns them as `state: 'error'` with an action.
export type YoucamErrorKind =
  | 'live_disabled' // mode or LIVE_CALLS_ENABLED forbids the call
  | 'replay_missing' // no recorded fixture; never falls through to the network
  | 'auth' // 401 or 403: stop live calls, alert, no retry
  | 'out_of_units' // stop the run, switch live calls off, alert
  | 'rate_limited' // 429 still failing after the retries
  | 'invalid_request' // 4xx other than the above: an Interim fault
  | 'unknown_outcome' // timeout or 5xx on create: the task may exist, never re-send
  | 'transient'; // timeout or 5xx on poll or upload: retry with growing delay

export class YoucamError extends Error {
  constructor(
    readonly kind: YoucamErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'YoucamError';
  }
}

// docs/product/spec.md section 11, for a task that ended in `error`.
export type TaskErrorAction =
  | 'block_tool' // this tool cannot work on this photo; cache as blocked and use the fallback order
  | 'new_photo' // ask for a new photo with a specific instruction; no retry
  | 'fault'; // Interim or YouCam fault; alert, no retry

const actions: Record<YoucamErrorCode, TaskErrorAction> = {
  error_hair_too_short: 'block_tool',
  error_bald_image: 'block_tool',
  error_face_angle_invalid: 'new_photo',
  error_insufficient_lighting: 'new_photo',
  error_lighting_dark: 'new_photo',
  error_no_face: 'new_photo',
  error_large_face_angle: 'new_photo',
  error_multiple_people: 'new_photo',
  error_multi_person: 'new_photo',
  error_face_not_forward_facing: 'new_photo',
  error_face_angle_upward: 'new_photo',
  error_face_angle_downward: 'new_photo',
  error_face_angle_leftward: 'new_photo',
  error_face_angle_rightward: 'new_photo',
  error_face_angle_left_tilt: 'new_photo',
  error_face_angle_right_tilt: 'new_photo',
  error_invalid_src: 'new_photo', // the photo shows only the lower body or feet
  error_no_shoulder: 'new_photo',
  error_pose: 'new_photo',
  error_face_pose: 'new_photo',
  error_insufficient_landmarks: 'new_photo',
  error_face_parsing: 'new_photo',
  error_face_position_invalid: 'new_photo',
  error_face_position_too_small: 'new_photo',
  error_face_position_out_of_boundary: 'new_photo',
  error_src_face_too_small: 'new_photo',
  error_src_face_out_of_bound: 'new_photo',
  // This garment cannot be shown on this photo (it covers a region the photo does not show, or
  // the result would match what the person already wears). Another garment may still work.
  error_apply_region_mismatch: 'block_tool',
  error_editing_failed: 'block_tool',
  error_nsfw_content_detected: 'new_photo', // moderation rejection
  exceed_nsfw_retry_limits: 'new_photo',
  // Normalisation should make these impossible, so they point at a bug on our side.
  error_invalid_ref: 'fault', // a catalog image is unusable
  error_below_min_image_size: 'fault',
  error_exceed_max_image_size: 'fault',
  error_mismatch_image_size: 'fault',
  error_unsupport_ratio: 'fault',
  exceed_max_filesize: 'fault',
  invalid_parameter: 'fault',
  error_download_image: 'fault',
  error_decode_image: 'fault',
  error_download_mask: 'fault',
  error_decode_mask: 'fault',
  error_inference: 'fault',
  error_upload: 'fault',
  unknown_internal_error: 'fault',
};

// A code YouCam adds later is not in the table; treat it as a fault rather than guess.
export function taskErrorAction(code: string): TaskErrorAction {
  const known = youcamErrorCodeSchema.safeParse(code);
  return known.success ? actions[known.data] : 'fault';
}
