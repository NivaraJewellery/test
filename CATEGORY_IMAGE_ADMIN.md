# Category images in Admin

Each collection/category can now have its own dedicated image.

1. Add the image file under `assets/categories/` in the project and push it to GitHub.
2. Open Admin > Collections.
3. Enter the image path, for example `assets/categories/anti-tarnish-bracelet.jpg`.
4. Click **Save collection**.

If the image field is blank, the storefront automatically falls back to one of the category's product images, so existing categories continue to work.

The database adds the `collections.image` column automatically when the collections API/Admin is used, so you do not need to reset the database.
