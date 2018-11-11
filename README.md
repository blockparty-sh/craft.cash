# craft.cash

Draw voxels using Bitcoin Cash. WIP.


#### Thanks to the following projects which made this possible

- https://github.com/Lallassu/vox2
- https://threejs.org/
- https://jquery.com/
- https://github.com/blockparty-sh/wallet
- https://bitdb.network/
- https://bitsocket.org/
- https://bitbox.earth/
- https://bitcore.io/

## Spec

The craft.cash protocol has three parts, the prefix `craft`, the world id which is 4 bytes, and then a variable length of multiple of 4 bytes containing `xyzc` block data. This is a single `OP_RETURN` output attached to any sort of transaction. Multiple transactions maybe be used in order to string together more than 51 block edits per transaction. 51 is limit of block changes per transaction due to `OP_RETURN` size limit. If there is extra data past the block data (such as [[xyzc] [xyzc] [xy]]) the transaction should be considered invalid in its entirety and skipped, ie if not a multiple of 4 bytes in length the transaction should be skipped.

#### Ordering

Blocks are read from earliest to latest, with later transactions overwriting earlier positions blocks can be changed in color or removed entirely (see color). Finally, transactions in the mempool should be displayed on top of all confirmed transactions presuming they are valid size.

#### World

The world is a 256^3 sized cube. There are 2^32 different worlds that exist. All blocks in a world start empty.

#### Axis

- X is "left and right"
- Y is "down and up"
- Z is "in and out"


#### Color

The `c` value can be either `0` which means empty, or `1-255` which converts to rgb color using the following formula:

```javascript
{
    r: ((c & 0xe0) >> 5) << 5,
    g: ((c & 0x1c) >> 2) << 5,
    b: (c  & 0x03) << 6
};
```

Blocks can be changed by matching the position and having a positive `c` value, and turned back to empty again with a `c` value of `0`.


#### Example

`6a 05 6372616674 04 00000000 40 a08af6f8 9f8af6f8 9e8af6f8 9d89f6f8 9d88f6f8 9d87f6f8 9c86f6f8 9c85f6f8 9b84f6f8 9a84f6f8 9a85f6f8 9a86f6f8 9a87f6f8 9a88f6f8 9a89f6f8 9a8af6f8`

Refers to:

`[OP_RETURN] [0x05 length of data] [craft] [0x04 length of data] [00000000 world id] [0x40 length of data] [[xyzc] [xyzc] [xyzc]...]`

To take the block `a08af6f8` we split it into 4 parts giving us the xyzc: `0xa0`, `0x8a`, `0xf6`, `0xf8`.

From this we know that x=160, y=138, z=246, c=248.

We convert `c` using the formula given in Color section giving us r=224, g=192, b=0.
