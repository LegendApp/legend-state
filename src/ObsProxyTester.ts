// import { Observable } from 'common/Obs/Observable';
// import { ObservableObject } from 'common/Obs/ObservableObject';
import { listenToObs } from './ObsProxyFns';
import { obsProxy } from './ObsProxy';
import { obsProxyComputed } from './ObsProxyComputed';
import { ObsBatcher } from './ObsBatcher';
import { obsPersist } from './ObsPersist';
import { ObsPersistLocalStorage } from './web/ObsPersistLocalStorage';
import { ObsStore } from './ObsStore';
// import { FieldMapTherapist } from '~/FieldTransfoms';

setTimeout(() => {
    // const a = obsProxy({
    //     b: {
    //         c: true,
    //     },
    //     d: {
    //         e: 'hi',
    //     },
    //     f: [1, 2, 3, 4],
    //     g: 5,
    // });

    // const b = obsProxy({
    //     auth: {
    //         uid: '',
    //         email: '',
    //     },
    //     UI: {
    //         activeClientTab: '',
    //         activeClientsTab: '',
    //     },
    //     session: {
    //         pageRedirectedToLogin: '',
    //     },
    //     therapist: {
    //         profile: {} as { name?: string },
    //         clientsList: {} as Record<string, true>,
    //     },
    // });

    // console.log(b);

    // console.log(a.value);
    // console.log(a.b);
    // listen(a, () => console.log('listened'));
    // console.log(a._value);
    // console.log(a._proxy.a);
    // console.log(a._proxy.a.b);
    // console.log(a);

    // debugger;
    // console.log(a);
    // console.log(a.b);

    // let bb = new Proxy({ a: 'hihihi' }, {});
    // console.log(bb);
    // console.log(bb.a);

    // // console.log(a.b);

    // // a.listen(() => console.log('listened'));

    // state.isListening = true;

    // a.b.c.listen((v) => console.log('changed a.b.c to', v));

    // a.listen((newValue) => console.log('changed a to', newValue));
    // // a.listen(() => console.log('listened'), 'b');
    // // a.listen(() => console.log('listened'), 'b', 'c');
    // a.b.listen((newValue) => console.log('changed a.b to', newValue));
    // a.g.listen((newValue) => console.log('changed a.g to', newValue));
    // a.f.listen((newValue) => console.log('changed a.f to', newValue));

    // b.listen((newValue) => console.log('changed b to', newValue));
    // b.auth.uid.listen((newValue) => console.log('changed uid to', newValue));

    // state.isListening = false;

    // a.g = 10;

    // a.f.push(5);

    // a.b.c = false;

    // console.log(a.b.c);

    // debugger;

    // a.b.c = false;

    // a.d = {
    //     e: 'hello',
    // };

    // state.isListening = true;
    // a.d.e.listen((newValue) => console.log('changed a.d.e to', newValue));
    // state.isListening = false;

    // console.log(a.d.e);

    // a.d.e = 'OH HI THERE';

    // console.log(a.d.e);
    // console.log(a.value);

    // debugger;
    // a.f.push(5);

    // console.log(a.f);

    // a.b;

    // const obsUI = obsProxy({} as { activeClientTab: string; activeClientsTab: string });
    // obsPersist(obsUI, {
    //     local: 'UI',
    //     localPersistence: ObsPersistLocalStorage,
    // });

    // console.log(obsUI);

    // obsUI.activeClientTab = 'test';

    // console.log(obsUI);

    const obsTherapist = obsProxy({
        profile: {} as { name?: string; test?: string },
        clientsList: {} as Record<string, true>,
    });

    // obsPersist(obsTherapist, {
    //     local: 'therapist',
    //     remote: {
    //         requireAuth: true,
    //         firebase: {
    //             fieldTransforms: FieldMapTherapist,
    //             syncPath: (uid) => `/therapists/${uid}/s`,
    //             spreadPaths: ['clientsList'],
    //         },
    //     },
    //     localPersistence: ObsPersistLocalStorage,
    // });

    obsTherapist.profile.name = 'Test';
    obsTherapist.profile = { name: 'TestOverride' };
    obsTherapist.profile.name = 'TestOverrideAgain';
    obsTherapist.profile.test = 'zz test';
    debugger;
    obsTherapist.profile = undefined;
    console.log(obsTherapist);

    // const obs1 = obsProxy<number>(5);
    // const obs2 = obsProxy<number>(10);
    // const obs3 = obsProxy({ hello: { hi: 12 } });

    // const obsc = obsProxyComputed(
    //     () => [obs1, obs2, obs3.hello.hi],
    //     (o1, o2, o3) => o1 + o2 + o3
    // );

    // console.log(obsc.value);

    // obs1.value = 20;

    // console.log(obsc.value);

    // Make sure value is always not proxies
    // const obs = obsProxy({ a: { b: { c: false } } });
    // console.log(obs.value);
    // obs.a.b.c = true;

    // console.log(obs.value);
    // console.log(obs.value.a.b.c);
    // console.log(obs.a.b.c);

    // obs.a = { b: { c: false } };
    // console.log(obs.value);
    // console.log(obs);

    // listenToObs(obs, (value) => console.log('changed', value));

    // obs.a.b.c = true;
    // console.log(obs.a.b);
    // console.log(obs.value);

    // const obs2 = obsProxy({ a: { b: { c: false } } });

    // obs2.a = obs2.a;

    // console.log(obs2.a);

    const obs3 = obsProxy({ hi: { there: 5 } });
    listenToObs(obs3, (v) => console.log('changed', JSON.stringify(v)));
    obs3.hi.there = 10;
    obs3.hi = { there: 20 };
    obs3.hi.value = { there: 30 };

    console.log(obs3.value);

    // perfTest();
}, 1000);

function perfTest() {
    // const Num = 10000;
    // const start1 = performance.now();
    // const obj1 = {};
    // for (let i = 0; i < Num; i++) {
    //     obj1[i + 'asdf'] = { text: 'text' + i };
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj1[i + 'asdf'].text = 'textz' + i;
    // }
    // let at = '';
    // for (let i = 0; i < Num; i++) {
    //     at = obj1[i + 'asdf'].text;
    // }
    // const end1 = performance.now();
    // const obj2 = obsProxy({});
    // for (let i = 0; i < Num; i++) {
    //     obj2[i + 'asdf'] = { text: 'text' + i };
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj2[i + 'asdf'].text = 'textz' + i;
    // }
    // let bt = '';
    // for (let i = 0; i < Num; i++) {
    //     bt = obj2[i + 'asdf'].text;
    // }
    // const end2 = performance.now();
    // const obj3 = {};
    // for (let i = 0; i < Num; i++) {
    //     obj3[i + 'asdf'] = new Observable({ text: 'text' + i });
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj3[i + 'asdf'].set({ text: 'textz' + i });
    // }
    // let ct = '';
    // for (let i = 0; i < Num; i++) {
    //     ct = obj3[i + 'asdf'].get().text;
    // }
    // const end3 = performance.now();
    // const obj4 = {};
    // for (let i = 0; i < Num; i++) {
    //     obj4[i + 'asdf'] = new ObservableObject({ text: 'text' + i });
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj4[i + 'asdf'].setProperty('text', 'textz' + i);
    // }
    // let dt = '';
    // for (let i = 0; i < Num; i++) {
    //     dt = obj4[i + 'asdf'].get().text;
    // }
    // const end4 = performance.now();
    // const obj5 = obsProxy({});
    // let numListens = 0;
    // listenToObs(obj5, (val) => {
    //     numListens++;
    // });
    // for (let i = 0; i < Num; i++) {
    //     obj5[i + 'asdf'] = { text: 'text' + i };
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj5[i + 'asdf'].text = 'textz' + i;
    // }
    // let et = '';
    // for (let i = 0; i < Num; i++) {
    //     et = obj5[i + 'asdf'].text;
    // }
    // const end5 = performance.now();
    // const obj6 = obsProxy({});
    // let numListens2 = 0;
    // listenToObs(obj6, (val) => {
    //     numListens2++;
    // });
    // ObsBatcher.beginBatch();
    // for (let i = 0; i < Num; i++) {
    //     obj6[i + 'asdf'] = { text: 'text' + i };
    // }
    // for (let i = 0; i < Num; i++) {
    //     obj6[i + 'asdf'].text = 'textz' + i;
    // }
    // ObsBatcher.endBatch();
    // let ft = '';
    // for (let i = 0; i < Num; i++) {
    //     ft = obj6[i + 'asdf'].text;
    // }
    // const end6 = performance.now();
    // console.log('bare', Math.round(end1 - start1));
    // console.log('proxy', Math.round(end2 - end1));
    // console.log('observable', Math.round(end3 - end2));
    // console.log('observableobject', Math.round(end4 - end3));
    // console.log('proxy listening', Math.round(end5 - end4), numListens);
    // console.log('proxy batched', Math.round(end6 - end5), numListens2);
}
