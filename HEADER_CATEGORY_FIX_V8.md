# Header + Shop by Category fix (v8)

- Removed the redundant `Account` link from the top navigation. Logged-in customers continue to use the customer avatar menu for Profile, Order History and Logout.
- Removed an older launch CSS override that was forcing the new category cards back into the previous overlay layout.
- Category names and **Explore Now** are displayed below the category image.
- Category images now use `object-fit: contain` with a small internal padding so the complete image remains visible instead of being cropped.
