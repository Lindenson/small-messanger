let audio = null;

export function initNotificationSound() {
  if (!audio) {
    audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.6;
  }
}

export function playNotificationSound() {
  if (!audio) return;

  audio.currentTime = 0;
  audio.play().catch(() => {
  });
}
