'use strict';
// Example builder: a cozy oak house. Demonstrates the general building API.
// A builder module exports { name, desc, size:[sx,sy,sz], build(a) }.
const { hollowBox, gableRoof, door } = require('./litematic.cjs');
module.exports = {
  name: 'example_house',
  desc: 'Cozy oak house with gable roof, windows and chimney',
  size: [16, 12, 16],
  build(a) {
    a.box(2, 0, 3, 13, 0, 12, 'minecraft:cobblestone');      // foundation
    a.box(3, 0, 4, 12, 0, 11, 'minecraft:oak_planks');       // floor
    hollowBox(a, 2, 1, 3, 13, 5, 12, 'minecraft:oak_planks'); // walls y1..5
    for (const [x, z] of [[2, 3], [13, 3], [2, 12], [13, 12]])
      a.box(x, 1, z, x, 5, z, 'minecraft:oak_log');          // corner posts
    gableRoof(a, 2, 3, 13, 12, 6, 'minecraft:oak_planks');   // stepped gable roof
    door(a, 7, 1, 3, 'south', 'minecraft:oak_door');         // double front door
    door(a, 8, 1, 3, 'south', 'minecraft:oak_door');
    for (const x of [4, 5, 10, 11]) { a.set(x, 3, 3, 'minecraft:glass'); a.set(x, 3, 12, 'minecraft:glass'); }
    for (const z of [6, 7, 9, 10]) { a.set(2, 3, z, 'minecraft:glass'); a.set(13, 3, z, 'minecraft:glass'); }
    a.set(7, 5, 7, 'minecraft:glowstone');                   // interior light
    a.set(8, 5, 8, 'minecraft:glowstone');
    a.box(12, 6, 11, 12, 9, 11, 'minecraft:cobblestone');    // chimney
  },
};