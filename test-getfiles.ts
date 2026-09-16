import { getFiles } from './server/utils/db.ts';

const mockEvent = {
  context: {},
};

async function test() {
  try {
    const res = await getFiles({
      context: {},
      node: {
        req: { url: '/api/files/list/org/01KTTJ3VAV3G1ZHBRVZVB563FW?page=1&sortBy=name&order=asc' }
      }
    }, 'ec7b7c7d-db85-4f40-87e9-2dbed6f2dd46'); // user id
    console.log("Result:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
