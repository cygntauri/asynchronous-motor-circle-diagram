document.addEventListener('DOMContentLoaded', function() {
  const links = document.querySelectorAll('.nav-link');
  const current = window.location.pathname.split('/').pop();
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href.endsWith(current) || (current === '' && href.endsWith('index.html'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
});
