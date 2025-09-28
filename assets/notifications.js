// Notification system for user feedback
class NotificationManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Create notification container if it doesn't exist
    this.container = document.getElementById('notification-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icon = this.getIcon(type);
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${icon}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" aria-label="Close notification">×</button>
      </div>
    `;

    // Add click handler for close button
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => this.remove(notification));

    // Add to container
    this.container.appendChild(notification);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => this.remove(notification), duration);
    }

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('notification-show');
    });

    return notification;
  }

  remove(notification) {
    if (notification && notification.parentNode) {
      notification.classList.add('notification-hide');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }

  getIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Export for use in app.js
window.NotificationManager = NotificationManager;