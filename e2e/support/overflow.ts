import type { Page } from "@playwright/test";

/** Quanto sobra além da largura visível, em qualquer região de rolagem da tela (rolagem lateral). */
export async function horizontalOverflowOf(page: Page): Promise<string[]> {
  return page.evaluate(`(() => {
    const overflowing = [];
    for (const element of document.querySelectorAll("body *")) {
      const isHidden = String(element.className).includes("sr-only");
      const style = getComputedStyle(element);
      // O truncate (reticências) corta de propósito; só a rolagem lateral é defeito.
      const isScrollable = style.overflowX !== "visible" && style.textOverflow !== "ellipsis";
      if (!isHidden && isScrollable && element.scrollWidth > element.clientWidth + 1) {
        overflowing.push(element.tagName + " " + element.scrollWidth + ">" + element.clientWidth);
      }
    }
    return overflowing;
  })()`);
}
