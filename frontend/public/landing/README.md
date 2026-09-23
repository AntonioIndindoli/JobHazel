# Landing page screenshots

These PNGs show the actual product components with fictional sample data:

| Filename | Landing page section | Suggested content |
| --- | --- | --- |
| applications.png | Application tracking | Your application board/pipeline |
| import.png | Job import | The import or review-import form |
| analytics.png | Search insights | Analytics charts or source-quality insights |
| interviews.png | Interview preparation and follow-ups | An interview detail view, ideally showing its notes and related context |

The page imports these images, using their actual dimensions to reserve space while loading. Replace the images and refresh
the local page. For the live website, deploy again after adding the files.

Use clear PNGs, preferably at least 1600 pixels wide for landscape screenshots.
Crop to the relevant app area and omit browser chrome. There is no required image
height or aspect ratio: images scale to the available width without cropping or
stretching. The same screenshot is used in both light and dark themes.

To refresh the captures, run `node scripts/capture-landing.cjs` from `frontend`
with Playwright available locally or through `NODE_PATH`, and Microsoft Edge installed.
The script renders existing React components and styles without accessing an account
or API. The import image is cropped to the review form's primary details.
No hero image is changed by these files.
