import type { CaptureProblem, PhotoKind } from '@interim/types';
import { UnprocessableEntityException } from '@nestjs/common';

/** A 422 whose body is a problem code the web app turns into a sentence in the person's language. */
export class CaptureError extends UnprocessableEntityException {
  constructor(
    readonly code: CaptureProblem,
    readonly kind?: PhotoKind,
  ) {
    super({ code, kind });
  }
}

/** Shorthand for `new CaptureError`, so a throw reads as one line. */
export function captureError(code: CaptureProblem, kind?: PhotoKind): CaptureError {
  return new CaptureError(code, kind);
}
