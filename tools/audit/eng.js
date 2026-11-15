const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const GnubgEngine = require(ROOT + '/gnubg-engine.js');
const { makeEngineAPI } = require(ROOT + '/engine-api.js');
module.exports = async () => {
  const M = await GnubgEngine({ locateFile: (p) => path.join(ROOT, p.endsWith('.data') ? 'gnubg-engine-data.bin' : p) });
  return makeEngineAPI(M);
};
if (require.main === module) module.exports().then(E => {
  const s = [0,0,0,0,0,5,0,3,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,2,0];
  console.log('ts', E.hasTS());
  console.time('m7'); const r = E.moves(s, s, 3, 1, {matchTo:0, cubeful:true}, 7); console.timeEnd('m7');
  console.log(r.moves.slice(0,3));
});
