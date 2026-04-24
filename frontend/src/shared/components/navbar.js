'use strict';

async function initNavbar() {
  const user = await Auth.getCurrentUser();
  if (!user) return;

  const nameEl   = document.getElementById('nav-name');
  const avatarEl = document.getElementById('nav-avatar');

  if (nameEl)   nameEl.textContent   = user.full_name;
  if (avatarEl) {
    avatarEl.textContent   = initials(user.full_name);
    avatarEl.style.background = avatarColor(user.full_name);
  }

  return user;
}
