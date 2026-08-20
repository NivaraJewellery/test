const heroArt = document.querySelector('.hero-art');
const heroSlides = [
  ['assets/made-to-be-noticed.png', 'Traditional gold necklace and jhumka earrings'],
  ['assets/hero-necklace-pendant.png', 'Gold pendant necklace'],
  ['assets/hero-necklace-classic.png', 'Classic gold necklace'],
  ['assets/hero-necklace-emerald.png', 'Emerald green bridal necklace and earrings']
];

if (heroArt) {
  let currentSlide = 0;
  heroArt.innerHTML = `<div class="hero-slides">${heroSlides.map(([source, alt], index) => `<img class="hero-slide${index === 0 ? ' active' : ''}" src="${source}" alt="${alt}">`).join('')}</div><div class="hero-slider-controls"><button class="hero-slider-button" data-direction="previous" aria-label="Previous jewellery image">&larr;</button><div class="hero-slider-dots">${heroSlides.map((_, index) => `<button class="hero-slider-dot${index === 0 ? ' active' : ''}" data-slide="${index}" aria-label="Show image ${index + 1}"></button>`).join('')}</div><button class="hero-slider-button" data-direction="next" aria-label="Next jewellery image">&rarr;</button></div><p>Made to be noticed</p>`;
  const showSlide = index => {
    currentSlide = (index + heroSlides.length) % heroSlides.length;
    heroArt.querySelectorAll('.hero-slide').forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === currentSlide));
    heroArt.querySelectorAll('.hero-slider-dot').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === currentSlide));
  };
  heroArt.querySelector('[data-direction="previous"]').addEventListener('click', () => showSlide(currentSlide - 1));
  heroArt.querySelector('[data-direction="next"]').addEventListener('click', () => showSlide(currentSlide + 1));
  heroArt.querySelectorAll('[data-slide]').forEach(dot => dot.addEventListener('click', () => showSlide(Number(dot.dataset.slide))));
  setInterval(() => showSlide(currentSlide + 1), 4500);
}
