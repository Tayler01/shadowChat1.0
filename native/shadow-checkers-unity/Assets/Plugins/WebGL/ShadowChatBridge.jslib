mergeInto(LibraryManager.library, {
  ShadowChatEvent: function (payload) {
    window.dispatchEvent(new CustomEvent('shadow-unity-event', { detail: JSON.parse(UTF8ToString(payload)) }));
  }
});
