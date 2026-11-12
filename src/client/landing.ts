const menuBtn = document.getElementById("menu-btn");
const menu = document.getElementById("menu");

if (menuBtn && menu) {
  menuBtn.addEventListener("click", function (): void {
    menu.classList.toggle("open");
  });

  const links = menu.querySelectorAll("a");
  for (let i = 0; i < links.length; i++) {
    links[i].addEventListener("click", function (): void {
      menu.classList.remove("open");
    });
  }
}
