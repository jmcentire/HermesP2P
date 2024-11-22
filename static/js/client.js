import { getConfiguration } from './config.js';
import { initializeUI } from './ui.js';

const configuration = getConfiguration();

initializeUI(configuration);