import { Platform, TextInput } from 'react-native';

let configured = false;

export const configureAndroidTextInputDefaults = () => {
  if (configured || Platform.OS !== 'android') return;

  TextInput.defaultProps = {
    ...(TextInput.defaultProps || {}),
    autoComplete: 'off',
    autoCorrect: false,
    disableFullscreenUI: true,
    importantForAutofill: 'no',
    spellCheck: false,
    underlineColorAndroid: 'transparent',
  };

  configured = true;
};
