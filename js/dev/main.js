//==============================================================================
// Author: Nergal
// Date: 2014-11-17
//==============================================================================
"use strict";

class Undo {
    constructor(x, y, z, old_c, new_c) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.old_c = old_c;
        this.new_c = new_c;
    }
}
class Game {
    constructor(tx_world, tx_block) {
        this.tx_world = tx_world;
        this.tx_block = tx_block;

        this.container;
        this.scene;
        this.camera;
        this.renderer;
        this.stats;
        this.clock;
        this.controls;
        this.selector;
        this.raycaster;
        this.composer;
        this.mouse;
        this.block_buffer = new Map(); // what we'll serialize and send
        this.syncing = false; // currently syncing? dont place blocks 
        this.selected_color = 255;
        this.undo_list = [];

        // Scene settings
        this.screenWidth = window.innerWidth;
        this.screenHeight = window.innerHeight;
        this.viewAngle = 80;
        this.aspect = this.screenWidth/this.screenHeight;
        this.near = 0.01;
        this.far = 200;
        this.use_shaders = true;

        // Object arrays
        this.world = undefined;
        this.phys = undefined;
        this.physMeshes = [];
        this.physBodies = [];

        // Keyboard and mouse
        this.key_w = 1 << 0;
        this.key_a = 1 << 1;
        this.key_s = 1 << 2;
        this.key_d = 1 << 3;
        this.key_q = 1 << 4;
        this.key_e = 1 << 5;

        this.keys_pressed = 0;
        this.mouse_pos;
    }

    init_scene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(this.viewAngle, this.aspect, this.near, this.far);
        // this.camera.position.set(10,0,30);
        this.scene.add(this.camera);
    }

    show_color_chooser() {
        $('#color-chooser').show();
        $('#selected-color').hide();
        document.exitPointerLock = document.exitPointerLock    ||
                                   document.mozExitPointerLock;
        document.exitPointerLock();

        $('#color-chooser').focus();
    }

    sync_changes() {
        if (! blockparty.is_logged_in()) {
            window.alert('you must login to wallet to sync');
            return;
        }

        if ((blockparty.fee_per_kb * Math.ceil(game.block_buffer.size / 51)) > (blockparty.get_balance() + blockparty.get_unconfirmed_balance())) {
            const remaining = blockparty.sat2bch((blockparty.fee_per_kb * Math.ceil(game.block_buffer.size / 51)) - (blockparty.get_balance() + blockparty.get_unconfirmed_balance()));
            window.alert(`you need ${remaining} bch more to sync`);
            return;
        }

        if (this.block_buffer.size == 0) {
            return;
        }

        this.undo_list = [];

        console.log('sync');
        this.syncing = true;
        $('#loading-status').show();
        $('#loading-status').text(`syncing (${game.block_buffer.size} remaining)`);
        $('#block-changes-count').text(game.block_buffer.size);

        let serialized_block_buf = "";

        let block_keys = [];
        for(const m of game.block_buffer.entries()) {
            const p = game.world.pos_to_xyz(m[0])

            serialized_block_buf += (p.x).toString(16).padStart(2, '0');
            serialized_block_buf += (p.y).toString(16).padStart(2, '0');
            serialized_block_buf += (p.z).toString(16).padStart(2, '0');
            serialized_block_buf += (m[1] & 0xFF).toString(16).padStart(2, '0');
            block_keys.push(m[0]);

            if (block_keys.length == 51) break; // can only store this much in op_return
        }

        let tx = new blockparty.bch.Transaction();

        const utxos = blockparty.get_utxos();
        let total_tiny = 0;
        for (let utxo of utxos) {
            if (utxo.satoshis >= 546 && utxo.satoshis < blockparty.fee_per_kb) {
                console.log('found tiny one');
                tx.from(utxo);
                total_tiny += utxo.satoshis;
            }
        }

        if (total_tiny > blockparty.fee_per_kb + (Math.ceil(tx.inputs.length / 1000 * 260) * blockparty.fee_per_kb)) {
            console.log('total_tiny is enough');
        } else {
            console.log('total_tiny too small');
            for (let utxo of utxos) {
                if (utxo.satoshis == blockparty.fee_per_kb) {
                    console.log('found small one');
                    tx.from(utxo);
                    break;
                } else if (utxo.satoshis > blockparty.fee_per_kb) {
                    console.log('found big one');
                    tx.from(utxo);
                    for (let i=0; i<utxo.satoshis - Math.ceil(utxo.satoshis / blockparty.fee_per_kb * 260) - (blockparty.fee_per_kb*2); i += blockparty.fee_per_kb) {
                        console.log('added output');
                        tx.to(blockparty.get_address(), blockparty.fee_per_kb);
                    }
                    break;
                }
            }
        }

        tx = blockparty.add_op_return_data(tx, [
            {'type': 'str', 'v': 'craft'}, // prefix: 1+1+5 = 7
            {'type': 'hex', 'v': this.tx_world}, // world: 1+1+4 = 6
            {'type': 'hex', 'v': serialized_block_buf}, // data-- 7+6+1 = 14... 220-14=206 bytes remain
        ]);
        tx.change(blockparty.get_address());
        tx.feePerKb(blockparty.fee_per_kb);
        tx = blockparty.clean_tx_dust(tx);
        tx = tx.sign(blockparty.get_private_key());
        window.tx = tx;
        console.log(tx);

        let that = this;

        blockparty.broadcast_tx(tx, () => {
            for (const i of block_keys) {
                game.block_buffer.delete(i);
            }

            setTimeout(() => {
                blockparty.update_balance(blockparty.update_balance_html);
                blockparty.update_utxos(() => {
                    $('#block-changes-count').text(that.block_buffer.size);
                    if (game.block_buffer.size > 0) {
                        game.sync_changes();
                    } else {
                        that.syncing = false;
                        $('#loading-status').hide();
                    }
                });
                blockparty.update_actions();
            }, 2000);
        }, false);
    }

    init_color_chooser() {
        // we skip 0 because black is color of removal
        for (let i=1; i<256; ++i) {
            let color = this.world.byte_to_rgb(i);
            let html_color = "rgb(" + color.r + "," + color.g + ", " + color.b + ")";
            
            $('<div/>', {
                'class': 'color-choice',
                'data-colorid': i,
                'style': 'background-color: ' + html_color
            }).appendTo($('#color-chooser'));
        }

        let that = this;
        $('.color-choice').click((e) => {
            $('.color-choice').removeClass('selected');
            $(e.target).addClass('selected');
            const color_id = $(e.target).data('colorid') | 0;
            let color = game.world.byte_to_rgb(color_id);
            let html_color = "rgb(" + color.r + "," + color.g + ", " + color.b + ")";
            that.selected_color = color_id;

            $('#color-chooser').hide();
            $('#selected-color').css('background-color', html_color);
            $('#selected-color').css('animation', 'none');
            $('#selected-color').show();

            document.body.requestPointerLock();
        });

        $('#selected-color').click(this.show_color_chooser);
    }

    init_selector() {
        let geometry = new THREE.BoxBufferGeometry(
            this.world.bs,
            this.world.bs,
            this.world.bs
        );
        let edges = new THREE.EdgesGeometry(geometry);

        this.selector = new THREE.LineSegments(
            edges,
            new THREE.LineDashedMaterial({
                color: 0xff0000,
                linewidth: 3,
                dashSize:  0.01,
                gapSize:   0.003
            })
        );

        this.selector.computeLineDistances();

        this.scene.add(this.selector);
    }

    init_keyboard_and_mouse() {
        let that = this;
        $(window).on('keydown', function(e) {
            if (e.ctrlKey) {
                switch (e.key) {
                    case 's':
                    case 'z':
                        e.preventDefault();
                        break;
                }
                return;
            }

            switch(e.key) {
                case 'w': that.keys_pressed |= that.key_w; break;
                case 'a': that.keys_pressed |= that.key_a; break;
                case 's': that.keys_pressed |= that.key_s; break;
                case 'd': that.keys_pressed |= that.key_d; break;
                case 'q': that.keys_pressed |= that.key_q; break;
                case 'e': that.keys_pressed |= that.key_e; break;
            }
        });
        $(window).on('keyup',(e) => {
            const ms = 0.1;

            if (e.ctrlKey) {
                switch (e.key) {
                    case 's':
                        this.sync_changes();
                        break;
                    case 'z':
                        this.undo();
                        break;
                }

                return;
            }

            switch(e.key) {
                case 'w': that.keys_pressed ^= that.key_w; break;
                case 'a': that.keys_pressed ^= that.key_a; break;
                case 's': that.keys_pressed ^= that.key_s; break;
                case 'd': that.keys_pressed ^= that.key_d; break;
                case 'q': that.keys_pressed ^= that.key_q; break;
                case 'e': that.keys_pressed ^= that.key_e; break;

                case 'i': this.controls.getObject().translateZ(-ms); break;
                case 'k': this.controls.getObject().translateZ(ms); break;
                case 'j': this.controls.getObject().translateX(-ms); break;
                case 'l': this.controls.getObject().translateX(ms); break;
                case 'u': {
                    if(this.controls.getObject().position.y > 1) {
                        this.controls.getObject().translateY(-ms);
                    }
                    break;
                }
                case 'o': this.controls.getObject().translateY(ms); break;

                case 'c': this.show_color_chooser(); break;
                case 'h': show_help_modal(); break;
                case 'H': $('#instructions').toggle(); break;
            }
        });

        this.mouse = {};

        this.mouse.pos = new THREE.Vector2();

        $(window).on('mousemove',(e) => {
            let canvasPosition = that.renderer.domElement.getBoundingClientRect();
            let mouseX = e.clientX - canvasPosition.left;
            let mouseY = e.clientY - canvasPosition.top;

            that.mouse.pos = new THREE.Vector2(
                2 *(mouseX / window.innerWidth) - 1,
                1 - 2 *(mouseY / window.innerHeight)
           );
        });

        $(window).on('mousedown',(e) => {
            if(e.button == 0) {
                that.mouse.left = true;
            }
            if(e.button == 2) {
                that.mouse.right = true;
            }
        });
        $(window).on('mouseup',(e) => {
            if(e.button == 0) {
                that.mouse.left = false;
            }
            if(e.button == 2) {
                that.mouse.right = false;
            }
        });
    }

    init_shaders() {
        this.composer = new THREE.EffectComposer(this.renderer);
        this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));

/*
        let glitchPass = new THREE.GlitchPass();
        glitchPass.renderToScreen = true;

        var effectVignette = new THREE.ShaderPass(THREE.VignetteShader);
        effectVignette.uniforms[ "offset" ].value = 0.05;
        effectVignette.uniforms[ "darkness" ].value = 0.1;
        effectVignette.renderToScreen = true;
*/

        let effectFXAA = new THREE.ShaderPass(THREE.FXAAShader);
        effectFXAA.uniforms[ 'resolution' ].value.set(1 / window.innerWidth, 1 / window.innerHeight);
        let bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight ), 0.26, 0.12, 0.9, 0.9); //1.0, 9, 0.5, 512);
        bloomPass.renderToScreen = true;

        this.composer.addPass(effectFXAA);
        // this.composer.addPass(new THREE.BloomPass(0.5));
        this.composer.addPass(new THREE.FilmPass(0.35, 0.025, 648, false));
        // this.composer.addPass(new THREE.ShaderPass(THREE.BleachBypassShader));
        this.composer.addPass(new THREE.ClearMaskPass);
        // this.composer.addPass(effectVignette);
        this.composer.addPass(bloomPass);
        // this.composer.addPass(glitchPass);

        this.renderer.gammaInput = true;
        this.renderer.gammaOutput = true;
    }

    init_lights() {
        console.time('init_lights');
        let ambientLight = new THREE.AmbientLight(0x330000);
        this.scene.add(ambientLight);

        let hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.9);
        hemiLight.color.setHSL(0.6, 1, 0.6);
        hemiLight.groundColor.setHSL(0.095, 1, 0.75);
        hemiLight.position.set(0, 500, 0);
        this.scene.add(hemiLight);

        let dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.color.setHSL(0.1, 1, 0.95);
        dirLight.position.set(10, 100.75, 10);
        dirLight.position.multiplyScalar(10);
        this.scene.add(dirLight);

        dirLight.castShadow = true;

        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.wheight = 2048;

        let d = 150;

        dirLight.shadow.camera.left   = -d;
        dirLight.shadow.camera.right  =  d;
        dirLight.shadow.camera.top    =  d;
        dirLight.shadow.camera.bottom = -d;

        dirLight.shadow.camera.far = 3500;
        dirLight.shadow.bias       = -0.0001;

        this.renderer.render(this.scene, this.camera);
        console.timeEnd('init_lights');
    }

    init_controls() {
        this.controls = new THREE.PointerLockControls(this.camera);
        this.scene.add(this.controls.getObject());
        this.controls.getObject().translateX(this.world.ws*this.world.bs/2);
        this.controls.getObject().translateY(-this.world.ws / 32);
        this.controls.getObject().translateZ(this.world.ws / 16);
    }

    init_plane() {
        let planeSize = this.world.ws*(this.world.bs);
        let geo = new THREE.PlaneBufferGeometry(planeSize, planeSize, 1, 1);
        let mat = new THREE.MeshLambertMaterial({color: 0xB3A184});
        let mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(planeSize/2, -0.09, planeSize/2); // -0.09 fixes flickering
        mesh.rotation.x = -Math.PI/2;
        this.scene.add(mesh);
    }

    init_renderer() {
        this.renderer = new THREE.WebGLRenderer({antialias: false});
        this.renderer.setSize(this.screenWidth, this.screenHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x333333, 1);
    }

    init_pointerlock() {
        let that = this;
        const pl_change = (e) => {
            that.controls.enabled = (
                document.pointerLockElement === document.body
             || document.mozPointerLockElement === document.body
             || document.webkitPointerLockElement === document.body);
        };
        const pl_error = (e) => {
            window.alert('error occurred when requesting pointerlock');
        };

        document.addEventListener('pointerlockchange',       pl_change, false);
        document.addEventListener('mozpointerlockchange',    pl_change, false);
        document.addEventListener('webkitpointerlockchange', pl_change, false);
        document.addEventListener('pointerlockerror',        pl_error, false);
        document.addEventListener('mozpointerlockerror',     pl_error, false);
        document.addEventListener('webkitpointerlockerror',  pl_error, false);
        document.getElementById('container').addEventListener('click', (e) => {
            document.body.requestPointerLock = (
                document.body.requestPointerLock
             || document.body.mozRequestPointerLock
             || document.body.webkitRequestPointerLock);
            $('#help-modal').hide();
            document.body.requestPointerLock();
        }, false);
    }


    init() {
        console.time('clock and stats');
        this.clock = new THREE.Clock();
        this.stats = new Stats();
        //$('#stats').append(this.stats.domElement);
        this.stats = new Stats();
        this.stats.domElement.style.position = 'absolute';
        this.stats.domElement.style.top = '0px';
        this.stats.domElement.style.right = '0px';
        this.stats.domElement.style.zIndex = 100;
        $('#container').append(this.stats.domElement);
        console.timeEnd('clock and stats');

        this.init_scene();
        this.init_renderer();
        this.init_shaders();

        this.container = document.getElementById('container');
        this.container.appendChild(this.renderer.domElement);


        THREEx.WindowResize(this.renderer, this.camera);

        
        this.world = new World();
        this.world.init();

        this.init_lights();
        this.init_controls();
        this.init_keyboard_and_mouse();
        this.init_pointerlock();
        this.init_selector();
        // this.init_plane();
        this.init_water();
        this.init_color_chooser();

        this.animate();
    }

    init_water() {
        console.time('init_water');
        const planeSize = this.world.ws*(this.world.bs);
        let geometry = new THREE.PlaneGeometry(planeSize, planeSize, 16 - 1, 16 - 1);
        geometry.applyMatrix(new THREE.Matrix4().makeRotationX(- Math.PI / 2));
        geometry.dynamic = true;

        for (let i = 0, il = geometry.vertices.length; i < il; i ++) {
            geometry.vertices[i].y = 0.4 * Math.sin(i/2);
        }

        geometry.computeFaceNormals();
        geometry.computeVertexNormals();

        const texture = new THREE.TextureLoader().load("textures/water2.png");
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10);

        const material = new THREE.MeshPhongMaterial({ color: 0x00CCFF, map: texture, transparent: true, opacity: 0.5});

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(planeSize/2, 0.5, planeSize/2);
        mesh.receiveShadow = true;
        this.mesh = mesh;
        this.scene.add(this.mesh);
        console.timeEnd('init_water');
    }

    draw_water(time) {
        for (let i = 0, l = this.mesh.geometry.vertices.length; i < l; i ++) {
            this.mesh.geometry.vertices[ i ].y = 0.2 * Math.sin(i / 5 +(time + i)/ 4);
        }
        this.mesh.geometry.verticesNeedUpdate = true;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerHeight, window.innerHeight);
    }

    dist(v1, v2) {
        const dx = v1.x - v2.x;
        const dy = v1.y - v2.y;
        const dz = v1.z - v2.z;
        return Math.sqrt(dx*dx+dy*dy+dz*dz);
    }

    undo() {
        // CTRL
        if (this.undo_list.length == 0) {
            return;
        }

        this.block_buffer = new Map();
        let chunk_update_set = new Set();

        let undos = this.undo_list.reverse();
        for (const u of undos) {
            this.world.remove_block(u.x, u.y, u.z);
            if (u.old_c != 0) {
                this.world.add_block(u.x, u.y, u.z, u.old_c);
            }
        }

        undos.reverse(); // undo the above reverse
        let final_undo = undos.pop();
        chunk_update_set.add(this.world.get_chunk_id(final_undo.x, final_undo.y, final_undo.z));
        for (const u of undos) {
            chunk_update_set.add(this.world.get_chunk_id(u.x, u.y, u.z));
            this.world.remove_block(u.x, u.y, u.z);
            this.block_buffer.set(this.world.xyz_to_pos(u.x, u.y, u.z), u.new_c);

            if (u.new_c > 0) {
                this.world.add_block(u.x, u.y, u.z, u.new_c);
            }
        }

        $('#block-changes-count').text(this.block_buffer.size);
        [...chunk_update_set].forEach(id => this.world.rebuild_specific_chunk(id));
    }

    render() {
        /*
        this.raycaster = new THREE.Raycaster();
        this.raycaster.setFromCamera(this.mouse_pos, this.camera);
        let intersects = this.raycaster.intersectObjects(this.scene.children);
        // if (intersects.length > 0)
        //console.log(this.mouse_pos, intersects.length, intersects[0].object.uuid);
        for (let i = 0; i < intersects.length; i++) {
            // intersects[i].object.material.transparent= true;
            // intersects[i].object.material.opacity= 0.5;
        }
        */

        if (this.use_shaders) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    animate() {
        this.animId = requestAnimationFrame(this.animate.bind(this));
        this.render();
        this.update();
    }

    update() {
        const time = this.clock.getElapsedTime() * 10;

        const cobj = this.controls.getObject();

        const cdir = new THREE.Vector3();
        game.controls.getDirection(cdir);

        const cpos = new THREE.Vector3(0, cdir.y, -1);
        cpos.applyQuaternion(cobj.quaternion);
        cpos.add(cobj.position);

        const bpos = new THREE.Vector3(
            (cpos.x / this.world.bs) | 0,
            (cpos.y / this.world.bs) | 0,
            (cpos.z / this.world.bs) | 0
        );

        // we cant add blocks while syncing or out of world area
        if (! this.syncing && this.tx_block === 100000000
         && this.controls.enabled // dont add block if just clicking from outside pointerlock
         && bpos.x >= 0 && bpos.x < this.world.ws
         && bpos.y >= 0 && bpos.y < this.world.ws
         && bpos.z >= 0 && bpos.z < this.world.ws
        ) {
            let chunkId = null;

            const buf_pos = this.world.xyz_to_pos(bpos.x, bpos.y, bpos.z);

            const undo = new Undo(
                bpos.x, bpos.y, bpos.z,
                this.world.get_block_color(bpos.x, bpos.y, bpos.z),
                this.selected_color
            );


            const add_to_undo_list = (c) => {
                undo.new_c = c;
                if (this.undo_list.length == 0) {
                    this.undo_list.push(undo);
                } else {
                    const u = this.undo_list[this.undo_list.length - 1];

                    if ((u.x != undo.x || u.y != undo.y || u.z != undo.z)
                    || (u.new_c != undo.new_c)) {
                        console.log(undo);
                        this.undo_list.push(undo);
                    }
                }
            }

            if (this.mouse.left
            && this.world.get_block_color(bpos.x, bpos.y, bpos.z) != this.selected_color) {

                this.world.remove_block(bpos.x, bpos.y, bpos.z);
                chunkId = this.world.add_block(bpos.x, bpos.y, bpos.z, this.selected_color);

                if(chunkId != null) {
                    this.block_buffer.set(buf_pos, this.selected_color);
                    $('#block-changes-count').text(this.block_buffer.size);

                    add_to_undo_list(this.selected_color);
                }
            }

            if (this.mouse.right
            && this.world.get_block_color(bpos.x, bpos.y, bpos.z) != 0) {
                chunkId = this.world.remove_block(bpos.x, bpos.y, bpos.z);

                if(chunkId != null) {
                    // delete from our block_buffer if we added it first
                    if(this.block_buffer.has(buf_pos)) {
                        this.block_buffer.delete(buf_pos);
                    } else {
                        this.block_buffer.set(buf_pos, 0); // 0 color for delete
                    }

                    $('#block-changes-count').text(this.block_buffer.size);

                    add_to_undo_list(0);
                }
            }

            if(chunkId != null) {
              this.world.rebuild_specific_chunk(chunkId);
            }
        }

        const spos = new THREE.Vector3(
            (bpos.x * this.world.bs) - (this.world.bs / 2),
            (bpos.y * this.world.bs) - (this.world.bs / 2),
            (bpos.z * this.world.bs) - (this.world.bs / 2)
        );
        // this.selector.applyQuaternion(cobj.quaternion);
        this.selector.position.copy(spos);

        if (time | 0 % 100 == 0) {
            const ms = 0.04;
            if (this.keys_pressed & this.key_w) { this.controls.getObject().translateZ(-ms); }
            if (this.keys_pressed & this.key_s) { this.controls.getObject().translateZ(ms);  }
            if (this.keys_pressed & this.key_a) { this.controls.getObject().translateX(-ms); }
            if (this.keys_pressed & this.key_d) { this.controls.getObject().translateX(ms);  }
            if (this.keys_pressed & this.key_q) { if(cobj.position.y > 1) this.controls.getObject().translateY(-ms); }
            if (this.keys_pressed & this.key_e) { this.controls.getObject().translateY(ms);  }
        }

        this.draw_water(time);
        this.stats.update();
    }
}
