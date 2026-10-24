import type { Env } from "../src/server/types";
import { route } from "../src/server/router";

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await route({
      request: context.request,
      env: context.env,
      waitUntil: (p) => context.waitUntil(p),
    });
  } catch (e) {
    console.log("Помилка: " + String(e));
    return new Response("Помилка сервера", { status: 500 });
  }
};
