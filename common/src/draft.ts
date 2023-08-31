// computeDelta(position: bigint, newColor: Color): {newDelta: number; newEnemymask: number} {
//     const {x, y} = bigIntIDToXY(position);
//     const data = {
//         newDelta: 0,
//         newEnemymask: 0,
//     };

//     {
//         const upPosition = xyToBigIntID(x, y - 1);
//         const color = this.getCellInMemory(upPosition).color;
//         if (color != Color.None) {
//             const enemyOrFriend = color == newColor ? 1 : -1;
//             if (enemyOrFriend < 0) {
//                 data.newEnemymask = data.newEnemymask | 1;
//             }
//             data.newDelta += enemyOrFriend;
//         }
//     }
//     {
//         const leftPosition = xyToBigIntID(x - 1, y);
//         const color = this.getCellInMemory(leftPosition).color;
//         if (color != Color.None) {
//             const enemyOrFriend = color == newColor ? 1 : -1;
//             if (enemyOrFriend < 0) {
//                 data.newEnemymask = data.newEnemymask | 1;
//             }
//             data.newDelta += enemyOrFriend;
//         }
//     }

//     {
//         const downPosition = xyToBigIntID(x, y + 1);
//         const color = this.getCellInMemory(downPosition).color;
//         if (color != Color.None) {
//             const enemyOrFriend = color == newColor ? 1 : -1;
//             if (enemyOrFriend < 0) {
//                 data.newEnemymask = data.newEnemymask | 1;
//             }
//             data.newDelta += enemyOrFriend;
//         }
//     }
//     {
//         const rightPosition = xyToBigIntID(x + 1, y);
//         const color = this.getCellInMemory(rightPosition).color;
//         if (color != Color.None) {
//             const enemyOrFriend = color == newColor ? 1 : -1;
//             if (enemyOrFriend < 0) {
//                 data.newEnemymask = data.newEnemymask | 1;
//             }
//             data.newDelta += enemyOrFriend;
//         }
//     }
//     return data;
// }
