fetch("http://localhost:3000/api/files/list/org/01KTTJ3VAV3G1ZHBRVZVB563FW")
  .then(r => r.json())
  .then(d => console.dir(d, {depth: null}))
  .catch(e => console.error(e));
