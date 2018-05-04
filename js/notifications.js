Fliplet.Widget.register('PushNotifications', function () {

  var id = $('[data-push-notification-id]').data('push-notification-id');
  var data = Fliplet.Widget.getData(id);
  var key = 'push-allow';
  var $popup = $('.popup-screen');
  var askPromise;

  var isConfigured = data && (data.apn || data.gcm || data.wns);

  if (!data || !data.showOnceOnPortal) {
    key += '-' + Fliplet.Env.get('appId');
  }

  if (!data || !isConfigured) {
    removeFromDom();
  }

  function removeFromDom() {
    $popup.remove();
  }

  function dismiss() {
    $popup.removeClass('ready');
  }

  function markAsSeen(val) {
    return Fliplet.Storage.set(key, val + '-' + Date.now());
  }

  function subscribeUser() {
    return Fliplet.User.subscribe(data);
  }

  function handleForegroundNotification(data) {
    $('#notificationContainer').remove();
    $('body').append(Fliplet.Native.Templates.InAppNotification);

    $('#appName').text(Fliplet.Env.get('appName'));
    $('#notificationTitle').text(data.title);
    $('#notificationBody').text(data.message);

    if (Fliplet.Env.get('pageId') === parseInt(data.additionalData.data.page)) {
      $('#btnNotificationNavigate').addClass('hidden');
    } else {
      $('#btnNotificationNavigate').on('click', function () {
        handleNotificationPayload(data.additionalData.data);
      });
    }

    setTimeout(function () {
      $('#notificationContainer').remove();
    }, 3000);
  }

  function handleNotificationPayload(data) {
    if (data && data.page) {
      var appPages = Fliplet.Env.get('appPages');

      if (Array.isArray(appPages) && appPages.length) {
        var page = appPages.filter(function(page) { return page.id === parseInt(data.page);});

        if (!page.length || Fliplet.Env.get('pageId') === parseInt(data.page)) {
          Fliplet.Native.Updates.checkForUpdates(Fliplet.Env.get('appId'), true, null, data);
          return;
        }
        else {
          Fliplet.Storage.set('fl_notification_update', data).then(function () {
            Fliplet.Navigate.to(data);
          });
        }
      }
    }
  }

  function ask() {
    if (!data || !isConfigured) {
      return Promise.reject('Please configure your push notification settings first.');
    }

    if (Fliplet.Env.get('interact')) {
      return Promise.reject('Push notifications are not enabled while using edit mode in Fliplet Studio.')
    }

    if (askPromise) {
      return askPromise;
    }

    askPromise = Fliplet.Storage.get(key).then(function (alreadyShown) {
      if (!alreadyShown || typeof alreadyShown !== 'string') {
        return true;
      }

      // If the user already allowed, just subscribe it
      if (alreadyShown.indexOf('allow') === 0) {
        return false;
      }

      return Promise.reject({
        code: 4,
        message: 'User has disallowed push notifications'
      });
    }).then(function (displayPopup) {
      if (!displayPopup) {
        return subscribeUser();
      }

      return new Promise(function (resolve, reject) {
        $popup.find('[data-allow]').one('click', function () {
          dismiss();
          
          markAsSeen('allow').then(function () {
            return subscribeUser();
          }).then(resolve).catch(function (err) {
            console.error(err);

            reject({
              code: 1,
              message: err
            });
          });
        });

        $popup.find('[data-dont-allow]').one('click', function () {
          dismiss();
          markAsSeen('disallow').then(function () {
            reject({
              code: 2,
              message: 'The user did not allow push notifications.'
            }); 
          }).catch(reject);
        });

        $popup.find('[data-remind]').one('click', function () {
          dismiss();
          markAsSeen('remind').then(function () {
            reject({
              code: 3,
              message: 'The user pressed the "remind later" button.'
            });
          }).catch(reject);
        });

        $popup.addClass('ready');
      });
    });

    return askPromise;
  }

  Fliplet().then(function () {
    return Fliplet.Storage.get(key);
  }).then(function (alreadyShown) {
    if (!data || !isConfigured) {
      return;
    }

    Fliplet.User.getSubscriptionId().then(function (isSubscribed) {
      var push = Fliplet.User.getPushNotificationInstance(data);

      if (!push) {
        return;
      }

      if (isSubscribed) {
        //Clear any notifications
        push.setApplicationIconBadgeNumber(function () { }, function () { }, 1);
        push.clearAllNotifications(function () { }, function () { });
      }

      push.on('notification', function (data) {
        Fliplet.Hooks.run('pushNotification', data).then(function () {
          if (data.additionalData) {
            if (data.additionalData.foreground) {
              handleForegroundNotification(data);
              return;
            }

            handleNotificationPayload(data.additionalData.data);
          }
        });
      });
    });

    // Show the popup if hasn't been shown yet to the user
    // and the component is set for automatic display
    if (!alreadyShown && data.showAutomatically) {
      return ask();
    }

    // Check if user has pressed allow but for some reason isn't subscribed yet.
    // This also happens when the user pressed allow from a parent app (portal)
    // and "showOnceOnPortal" is checked
    if (typeof alreadyShown === 'string' && alreadyShown.indexOf('allow') === 0) {
      return subscribeUser();
    }
  });

  return {
    ask: ask,
    reset: function () {
      return Fliplet.Storage.remove(key);
    }
  };
});
