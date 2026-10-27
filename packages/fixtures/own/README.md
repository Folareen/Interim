# Generated test people

Two synthetic people for testing and for the demo, made with YouCam's own image generator (`youcam-image-v2`). They are not real people, and the app labels them as simulated.

- `a/`: a woman in five hair stages (full, thinner, short, none, growing back) plus left and right views for the baseline. The baseline views are the set that passed YouCam's hair type detection. Each later stage is an image to image edit of the first photo, so the face, clothes and background stay the same.
- `b/`: a man with three front photos (the face slightly, then noticeably, fuller), left and right views, and three body photos at three builds, all edited from the first photo of each kind.
- `garments/`: four generated garment pictures. The sample catalog uses them (resized) as the reference pictures for clothes try on.

The recorded answers for these photos are in `../youcam` and `../planner`, named by the pipeline's cache keys, which hash the photos. Do not resize or re-encode a file, or its recording is no longer found.

They were recorded by running both people through the real app in `record` mode (docs/integrations/youcam.md). The demo copies them (docs/development.md, Demo data).
