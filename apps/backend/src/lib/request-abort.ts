import type { Response } from 'express';

export type ResponseAbortBinding = {
  signal: AbortSignal;
  isDisconnected: () => boolean;
  dispose: () => void;
};

export function bindResponseAbort(
  res: Response,
  label: string
): ResponseAbortBinding {
  const controller = new AbortController();
  let disconnected = false;

  const onClose = () => {
    if (res.writableEnded) return;
    disconnected = true;
    controller.abort(new Error(`${label} client disconnected`));
  };
  const dispose = () => {
    res.removeListener('close', onClose);
    res.removeListener('finish', dispose);
  };

  res.once('close', onClose);
  res.once('finish', dispose);

  return {
    signal: controller.signal,
    isDisconnected: () => disconnected,
    dispose,
  };
}
