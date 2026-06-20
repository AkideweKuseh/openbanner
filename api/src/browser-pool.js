import puppeteer from 'puppeteer';
import { config } from './config.js';
import { logger } from './logger.js';

let browser = null;
let launching = null;

async function launch() {
  const b = await puppeteer.launch({ headless: true, args: config.chromeArgs });
  b.on('disconnected', () => {
    browser = null;
    logger.warn('chromium disconnected');
  });
  return b;
}

export async function getBrowser() {
  if (browser && browser.connected) return browser;
  if (!launching) {
    launching = launch()
      .then((b) => { browser = b; launching = null; return b; })
      .catch((e) => { launching = null; throw e; });
  }
  return launching;
}

export async function acquirePage() {
  const b = await getBrowser();
  const context = await b.createBrowserContext(); // isolated per render
  const page = await context.newPage();
  return {
    page,
    async release() {
      try { await context.close(); } catch { /* ignore */ }
    },
  };
}

export function isReady() {
  return Boolean(browser && browser.connected);
}

export async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
  }
}
