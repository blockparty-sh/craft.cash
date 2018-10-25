//==============================================================================
// Author: Nergal
// Date: 2015-03-11
//==============================================================================
// Block: int32
//  1byte = colorMap to palette
//  2byte = x world position
//  3byte = y world position
//  4byte = z world position
//
// Binary string to decimal conversion
String.prototype.bin = () => {
    return parseInt(this, 2);
};

// Decimal to binary string conversion
Number.prototype.bin = () => {
    let sign = (this < 0 ? "-" : "");
    let result = Math.abs(this).toString(2);

    while(result.length < 32) {
        result = "0" + result;
    }
    return sign + result;
}

class Block {
    constructor(p, c) {
        this.color = c;
        this.pos = p;
    }
}

class World {
    constructor() {
        this.ws = 256; //worldsize
        this.cs = 16; // chunksize
        this.bs = 0.1; // blocksize
        this.chunks; // Chunks + blocks [chunkId][blocks]
        this.active; // chunks active blocks
        // Faster to loop through array than using hashmap in JS. And we don't want to allocate 4096*4bytes just to keep chunkid 4096.
        this.id_map = new Array(); // [incr++] = <chunkId>
        this.meshes = new Array(); // chunk meshes
    }

    init() {
        console.time('init');
        this.active = new Array();
        this.chunks = new Array();

        let blocks_map = new Map();

        let that = this;
        setTimeout(() => {
			$('#loading-status').text('downloading blocks...');
			console.log(`world ${game.tx_world}`);
			console.log(`blocks ${game.tx_block}`);

            blockparty.query_bitdb({
                "v": 3,
                "q": {
                    "find": {
                        "out.s1": "craft",
                        "out.h2": game.tx_world,
						"blk.i": {"$lte": game.tx_block},
                    },
					"sort": {"blk.t": 1}, // reverse block order so we can overwrite past blocks
                    "limit": 1000
                }
                
            }, (data) => {
                let data_chunks = [];
                for(const m of data.c) {
                    for (const j of m.out) {
                        if (j.s1 == 'craft') {
                            data_chunks.push(j.h3);
                        }
                    }
                }

                for(const m of data.u) {
                    for (const j of m.out) {
                        if (j.s1 == 'craft') {
                            data_chunks.push(j.h3);
                        }
                    }
                }

                data_chunks = data_chunks
                    .map(x => x.match(/.{1,8}/g)
                        .map(y => y.match(/.{1,2}/g)
                            .map(z => Number.parseInt(z, 16))));

                for (const chunk of data_chunks) {
                    for (const m of chunk) {
                        if (m.length == 4) {
                            blocks_map.set(that.xyz_to_pos(m[0], m[1], m[2]), {
                                "x": m[0],
                                "y": m[1],
                                "z": m[2],
                                "c": m[3]
                            });
                        }
                    }
                }


                let blocks = Array.from(blocks_map.values());
                
                let block_adder = () => {
                    console.time('adding blocks');
                    const amnt = 17777;
                    $('#loading-status').text(blocks.length + ' blocks remaining');
                    for(let i=0; i<amnt && i<blocks.length; ++i) {
                        let m = blocks[i];
                        if (m.c != 0) {
                            that.add_block(m.x, m.y, m.z, m.c);
                        }
                    }
                    blocks.splice(0, amnt);

                    if (blocks.length > 0) {
                        setTimeout(block_adder, 3);
                    } else {
                        that.rebuild_chunks();
                        $('#loading-status').hide();
                    }
                    console.timeEnd('adding blocks');
                }; block_adder();

            });
        }, 1);
    }

    rebuild_chunks() {
        console.time('rebuild chunks');
        for(let i = 0; i < this.id_map.length; i++) {
            if (this.chunks[i] != undefined) {
                this.rebuild_chunk(i);
            }            
        }
        console.timeEnd('rebuild chunks');
	}

    rebuild_specific_chunk(chunkId) {
        for(let i = 0; i < this.id_map.length; i++) {
            if (this.id_map[i] == chunkId) {
                this.rebuild_chunk(i);
                return;
            }            
        }
	}

    get_chunk(chunkId) {
        for(let i = 0; i < this.id_map.length; i++) {
            if (this.id_map[i] == chunkId) {
                return this.chunks[i];
            }
        }
        return null;
    }

	xyz_to_pos(x, y, z) {
		return (x & 0xFF) << 24
             | (y & 0xFF) << 16
             | (z & 0xFF) << 8;
	}

	pos_to_xyz(p) {
		return {
            x: ((p >> 24) & 0xFF),
            y: ((p >> 16) & 0xFF),
            z: ((p >> 8)  & 0xFF)
        };
	}

    byte_to_rgb(c) {
        return {
            r: ((c & 0xe0) >> 5) << 5,
            g: ((c & 0x1c) >> 2) << 5,
            b: (c  & 0x03) << 6
        };
    }

    add_block(x, y, z, color) {
        let block    = new Block(this.xyz_to_pos(x, y, z), color & 0xFF);
        let chunkId  = this.get_chunk_id(x, y, z);
        let chunkPos = this.world_to_chunk_position(x, y, z);
        let chunk    = this.get_chunk(chunkId);

        if (chunk == null) {
            this.id_map.push(chunkId);
            this.chunks[this.id_map.length-1] = new Array();
            this.chunks[this.id_map.length-1].push(block);
        } else {
            for(let i = 0; i < chunk.length; i++) {
                if (chunk[i].pos == block.pos) {
                    return null; // block already exists
                }
            }
            chunk.push(block);
        }

        let cx = chunkPos.x;
        let cy = chunkPos.y;
        let cz = chunkPos.z;
        if (this.active[chunkId] == undefined) {
            this.active[chunkId] = new Array();
        }
        if (this.active[chunkId][cx] == undefined) {
            this.active[chunkId][cx] = new Array();
        }
        this.active[chunkId][cx][cy] |= 1 << cz; 
        return chunkId;
    }

	remove_block(x, y, z) {
        let pos      = this.xyz_to_pos(x, y, z);
        let chunkId  = this.get_chunk_id(x, y, z);
        let chunk    = this.get_chunk(chunkId);
        let chunkPos = this.world_to_chunk_position(x, y, z);
        let cx = chunkPos.x;
        let cy = chunkPos.y;
        let cz = chunkPos.z;


        if (chunk == null) {
			return null; // block doesnt exit
        } else {
            for(let i = 0; i < chunk.length; i++) {
                if (pos == chunk[i].pos) {
					chunk.splice(i, 1);
                    this.active[chunkId][cx][cy] ^= 1 << cz; 

                    if (this.active[chunkId][cx][cy] == 0) {
                        this.active[chunkId][cx].splice(cy, 1);

                        if (this.active[chunkId][cx].length == 0) {
                            this.active[chunkId].splice(cx, 1);
                        }
                    }

                    return chunkId;
                }
            }

			return null; // block doesnt exist
        }
    }

    world_to_chunk_position(x, y ,z) {
        let cx = x-(this.cs*parseInt(x/this.cs));  
        let cy = y-(this.cs*parseInt(y/this.cs));  
        let cz = z-(this.cs*parseInt(z/this.cs));  
        return {x: parseInt(cx), y: parseInt(cy), z: parseInt(cz)};
    }

    get_chunk_id(x, y, z) {
        /*
        let offset = this.bs*this.cs;
        let cx = parseInt(x/this.cs)*offset;
        let cy = parseInt(y/this.cs)*offset;
        let cz = parseInt(z/this.cs)*offset;

        return this.xyz_to_pos(x, y, z);
*/
        let offset = this.bs*this.cs;
        let cx = parseInt(x/this.cs)*offset;
        let cy = parseInt(y/this.cs)*offset;
        let cz = parseInt(z/this.cs)*offset;
        let str = cx+","+cy+","+cz;
        return btoa(str);
    }

    rebuild_chunk(vcid) {
        let vertices = [];
        let colors = [];


        // Get chunk 
        let rcid = this.id_map[vcid];

        // Get chunkPosition
        let res = atob(rcid).split(",");
        let chunkPosX = res[0];
        let chunkPosY = res[1];
        let chunkPosZ = res[2];
        /*
        let res = this.pos_to_xyz(rcid);
        let chunkPosX = res.x;
        let chunkPosY = res.y;
        let chunkPosZ = res.z;*/

        let chunk = this.get_chunk(rcid);
        if (chunk == null) {
            return;
        }

        // Get bitlist of active blocks in chunk
        let active = this.active[rcid];

        for(let i = 0; i < this.chunks[vcid].length; i++) {
            let x = 0, y = 0, z = 0, color = 0, lx = 0, sides = 0;
            let front = 0, back = 0, bottom = 0, top = 0, right = 0, left = 0;
            let r = 0, g = 0, b = 0, c = 0; 

            x = (this.chunks[vcid][i].pos >> 24) & 0xFF;
            y = (this.chunks[vcid][i].pos >> 16) & 0xFF;
            z = (this.chunks[vcid][i].pos >> 8)  & 0xFF;
            color = this.byte_to_rgb(this.chunks[vcid][i].color & 0xFF);   // color

            let pos = this.world_to_chunk_position(x, y, z);
            if (pos.z+1 < 16) {
                front = (active[pos.x][pos.y] >> (pos.z+1)) & 0x01;
            } 
            // Check2: z-1 is active?
            if (pos.z-1 >= 0) {
                back = (active[pos.x][pos.y] >> (pos.z-1)) & 0x01;
            }
            // Check3: y-1 is active?
            if (y == 0) {
                bottom = 1;
            } else {
                if (active[pos.x][pos.y-1] != undefined && active[pos.x][pos.y-1].length > 0) {
                    bottom = (active[pos.x][pos.y-1] >> (pos.z)) & 0x01;
                }
            }
            // Check4: y+1 is active?
            if (active[pos.x][pos.y+1] != undefined && active[pos.x][pos.y+1].length > 0) {
                top = (active[pos.x][pos.y+1] >> (pos.z)) & 0x01;
            }

            // Check5: x+1 is active?
            if (active[pos.x+1] != undefined && active[pos.x+1].length > 0) {
                right = (active[pos.x+1][pos.y] >> pos.z) & 0x01;
            } 
            // Check6: x-1 is active?
            if (active[pos.x-1] != undefined && active[pos.x-1].length > 0) {
                left = (active[pos.x-1][pos.y] >> pos.z) & 0x01;
            }

            if ((front & back & bottom & top & right & left) == 1) {
                continue;
            }

            const add_colors = () => {
                for(let n = 0; n < 6; n++) {
                    colors.push([color.r, color.g, color.b]);
                }
            }

            if (! bottom) {
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);

                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);

                add_colors();
            }
            if (! top) {
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs]);

                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);

                sides += 6;
                add_colors();
            }
            if (! front) {
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);

                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);

                sides += 6;
                add_colors();
            }
            if (! back) {
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);

                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);

                sides += 6;
                add_colors();
            }
            if (! left) {
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs]);

                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs-this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);

                sides += 6;
                add_colors();
            }
            if (! right) {
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs]);

                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs-this.bs, pos.z*this.bs-this.bs]);
                vertices.push([pos.x*this.bs, pos.y*this.bs, pos.z*this.bs-this.bs]);

                sides += 6;
                add_colors();
            }
        }

        // Draw chunk
        let geometry = new THREE.BufferGeometry();
        let v = new THREE.BufferAttribute(new Float32Array(vertices.length * 3), 3);
        for (let i = 0; i < vertices.length; i++) {
            v.setXYZ(i, vertices[i][0], vertices[i][1], vertices[i][2]);
        }
        geometry.addAttribute('position', v);

        let col = new THREE.BufferAttribute(new Float32Array(colors.length * 3), 3);
        for (let i = 0; i < colors.length; i++) {
            col.setXYZW(i, colors[i][0]/255, colors[i][1]/255, colors[i][2]/255, 1);
        }
        geometry.addAttribute('color', col);

        geometry.computeVertexNormals();
        geometry.computeFaceNormals();
        let material = new THREE.MeshLambertMaterial({ vertexColors: THREE.VertexColors, wireframe: false});
        let mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(chunkPosX, chunkPosY , chunkPosZ);
        mesh.receiveShadow = true;
        mesh.castShadow = true;

        if (this.meshes[vcid] != undefined) {
            game.scene.remove(this.meshes[vcid]);
        }
        this.meshes[vcid] = mesh;

        game.scene.add(this.meshes[vcid]);
    }
}
