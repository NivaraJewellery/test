# Feedback carousel v30i

Based on v30h.

## Changes
- The homepage **What Our Customers Say** section is hidden by default.
- The section is revealed only when `/api/public-reviews` returns at least one Admin-approved/published feedback or product review with a comment.
- Published feedback is displayed in a responsive horizontal carousel.
- The carousel advances automatically every 5 seconds when more cards exist than fit in the viewport.
- It loops back to the first card after the last visible group.
- Previous/next buttons support manual navigation.
- Auto-scroll pauses on hover, keyboard focus, and pointer interaction.
- Mobile uses one review per view and supports native swipe scrolling.
- Auto-scroll respects the browser's Reduced Motion preference.

No database or API migration is required. Existing Admin **Show on website / Hide from website** moderation remains unchanged.
