//==============================================================================
// Author: Nergal
// Date: 2014-11-17
//==============================================================================
"use strict";

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

        if (game.block_buffer.size == 0) {
            return;
        }

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

        for (const i of block_keys) {
            game.block_buffer.delete(i);
        } 


        let tx = new blockparty.bch.Transaction();
        tx.from(blockparty.get_utxos());
        tx = blockparty.add_op_return_data(tx, [
            {'type': 'str', 'v': 'craft'}, // prefix: 1+1+5 = 7
            {'type': 'hex', 'v': this.tx_world}, // world: 1+1+4 = 6
            {'type': 'hex', 'v': serialized_block_buf}, // data-- 7+6+1 = 14... 220-14=206 bytes remain
        ]);
        tx.feePerKb(blockparty.fee_per_kb);
        tx.change(blockparty.get_address());
        tx = blockparty.clean_tx_dust(tx);
        tx = tx.sign(blockparty.get_private_key());
        console.log(tx);

        let that = this;
        blockparty.broadcast_tx(tx, () => {
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
            switch(e.key) {
                case 'w': that.keys_pressed ^= that.key_w; break;
                case 'a': that.keys_pressed ^= that.key_a; break;
                case 's': that.keys_pressed ^= that.key_s; break;
                case 'd': that.keys_pressed ^= that.key_d; break;
                case 'q': that.keys_pressed ^= that.key_q; break;
                case 'e': that.keys_pressed ^= that.key_e; break;
                case 'c': this.show_color_chooser(); break;
                case 'z': this.sync_changes(); break;
                case 'h': show_help_modal(); break;
                case 'H': $('#instructions').toggle(); break;
            }

            const ms = 0.1;
            switch(e.key) {
                case 'i': this.controls.getObject().translateZ(-ms); break;
                case 'k': this.controls.getObject().translateZ(ms); break;
                case 'j': this.controls.getObject().translateX(-ms); break;
                case 'l': this.controls.getObject().translateX(ms); break;
                case 'u': this.controls.getObject().translateY(ms); break;
                case 'o': {
                    if(this.controls.getObject().position.y > 1) {
                        this.controls.getObject().translateY(-ms);
                    }
                    break;
                }
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
        let bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight ), 0.86, 0.12, 0.9, 0.9); //1.0, 9, 0.5, 512);
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
        let mat = new THREE.MeshLambertMaterial({color: 0xEED6AF});
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
        var pointerlockchange = function(event) {
            if (document.pointerLockElement === document.body || document.mozPointerLockElement === document.body || document.webkitPointerLockElement === document.body) {
                that.controls.enabled = true;
                // blocker.style.display = 'none';
            } else {
                that.controls.enabled = false;
                // blocker.style.display = 'block';
                // instructions.style.display = '';
            }
        };
        var pointerlockerror = function(event) {
            // instructions.style.display = '';
        };

        document.addEventListener('pointerlockchange', pointerlockchange, false);
        document.addEventListener('mozpointerlockchange', pointerlockchange, false);
        document.addEventListener('webkitpointerlockchange', pointerlockchange, false);
        document.addEventListener('pointerlockerror', pointerlockerror, false);
        document.addEventListener('mozpointerlockerror', pointerlockerror, false);
        document.addEventListener('webkitpointerlockerror', pointerlockerror, false);
        document.getElementById('container').addEventListener('click', function(event) {
            // Ask the browser to lock the pointer
            document.body.requestPointerLock = document.body.requestPointerLock || document.body.mozRequestPointerLock || document.body.webkitRequestPointerLock;
            if (that.selected_color == 0) {
                window.alert('Press `c` to open color selector');
            } else {
                $('#help-modal').hide();
                document.body.requestPointerLock();
            }
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
        // get position in front of and below camera
        const cpos = new THREE.Vector3(0, -1, -1);
        cpos.applyQuaternion(cobj.quaternion);
        cpos.add(cobj.position);

        const bpos = new THREE.Vector3(
            (cpos.x / this.world.bs) | 0,
            (cpos.y / this.world.bs) | 0,
            (cpos.z / this.world.bs) | 0
        );

        // we cant add blocks while syncing or out of world area
        if (! this.syncing && this.tx_block === 100000000
         && bpos.x >= 0 && bpos.x < this.world.ws
         && bpos.y >= 0 && bpos.y < this.world.ws
         && bpos.z >= 0 && bpos.z < this.world.ws
        ) {
            let chunkId = null;

            const buf_pos = this.world.xyz_to_pos(bpos.x, bpos.y, bpos.z);
            if(this.mouse.left && this.selected_color != 0) {
                chunkId = this.world.add_block(bpos.x, bpos.y, bpos.z, this.selected_color);

                if(chunkId != null) {
                    this.block_buffer.set(buf_pos, this.selected_color);
                    $('#block-changes-count').text(this.block_buffer.size);
                }
            }

            if(this.mouse.right) {
                chunkId = this.world.remove_block(bpos.x, bpos.y, bpos.z);

                if(chunkId != null) {
                    // delete from our block_buffer if we added it first
                    if(this.block_buffer.has(buf_pos)) {
                        this.block_buffer.delete(buf_pos);
                    } else {
                        this.block_buffer.set(buf_pos, 0); // 0 color for delete
                    }

                    $('#block-changes-count').text(this.block_buffer.size);
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
            if (this.keys_pressed & this.key_q) { this.controls.getObject().translateY(ms);  }
            if (this.keys_pressed & this.key_e) { if(cobj.position.y > 1) this.controls.getObject().translateY(-ms); }
        }

        this.draw_water(time);
        this.stats.update();
    }
}
