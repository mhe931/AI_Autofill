document.getElementById('fillBtn').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      func: triggerFormFill
    });
  });
});

// This function is injected into the page when the button is clicked
function triggerFormFill() {
    window.dispatchEvent(new CustomEvent('START_VAASA_FILL'));
}