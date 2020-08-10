import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/flow';
import { delay } from './testutils';
import { BTContext } from '../src/bthread';

test("the log will return an latestAction Object", () => {

    const thread1 = flow(null, function* () {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    });

    const thread2 = flow(null, function* () {
        yield bp.wait("eventTwo");
    })

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({log}) => {
        expect(log?.latestAction.event.name).toEqual('eventOne');
    });
});

test("the log will have a Map of all active threads", () => {

    const thread1 = flow({id: 'thread1', title: 'myThread1'}, function* () {
        yield [bp.request("eventOne"), bp.wait("eventTwo")];
    });

    const thread2 = flow({id: 'thread2', title: 'myThread2'}, function* () {
        yield bp.wait("eventTwo");
    })

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({log}) => {
        expect(log?.bThreadInfoById.thread1.title).toEqual('myThread1');
        expect(log?.bThreadInfoById.thread2.title).toEqual('myThread2');
    });
});



test("log will contain reactions by thread-id", () => {
    const flow1 = flow(
        {
          id: "flow1",
          title: "user is able to select a product"
        },
        function*(this: BTContext) {
          this.section("productList");
          const id = yield bp.wait("selectProduct");
          const item = yield bp.request("apiGetProductDetails", "testData");
          yield bp.set({ name: "productDetails", key: id }, item);
          this.section("productDetails");
          yield bp.wait("acceptAGB");
          this.section("new Section");
          yield bp.set("agbAccepted", "true");
        }
      );
      
      const flow2 = flow(
        {
          id: "flow2",
          title: "count actions"
        },
        function*() {
            const id = yield bp.request("selectProduct");
            yield bp.trigger("acceptAGB");
        }
      );

      testScenarios((enable) => {
        enable(flow1());
        enable(flow2());
    }, ({log}) => {
        expect(log?.bThreadInfoById['flow1'].reactions.size).toBe(5);
        const flow1Keys = [...(log?.bThreadInfoById['flow1'].reactions.keys() || [])];
        const flow2Keys = [...(log?.bThreadInfoById['flow2'].reactions.keys() || [])];
        expect(flow1Keys[0]).toEqual(0);
        expect(log?.bThreadInfoById['flow1'].reactions.get(0)?.threadSection).toEqual('productList');
        expect(log?.bThreadInfoById['flow1'].reactions.get(0)?.event?.name).toEqual('selectProduct');
        expect(flow1Keys[1]).toEqual(1);
        expect(log?.bThreadInfoById['flow1'].reactions.get(1)?.event?.name).toEqual('apiGetProductDetails');
        expect(flow1Keys[2]).toEqual(2);
        expect(log?.bThreadInfoById['flow1'].reactions.get(2)?.event?.name).toEqual('productDetails');
        expect(flow1Keys[3]).toEqual(3);
        expect(log?.bThreadInfoById['flow1'].reactions.get(3)?.event?.name).toEqual('acceptAGB');
        expect(flow1Keys[4]).toEqual(4);
        expect(log?.bThreadInfoById['flow1'].reactions.get(4)?.event?.name).toEqual('agbAccepted');
        // flow 2
        expect(log?.bThreadInfoById['flow2'].reactions.size).toBe(2);
        expect(flow2Keys[0]).toEqual(0);
        expect(log?.bThreadInfoById['flow2'].reactions.get(0)?.event?.name).toEqual('selectProduct');
        expect(log?.bThreadInfoById['flow2'].reactions.get(1)?.event?.name).toBeUndefined();
        expect(log?.bThreadInfoById['flow2'].reactions.get(2)?.event?.name).toBeUndefined();
        expect(flow2Keys[1]).toEqual(3);
        expect(log?.bThreadInfoById['flow2'].reactions.get(3)?.event?.name).toEqual('acceptAGB');
    });
})


test("log will contain a list of executed actions (sorted)", () => {
    const flow1 = flow(
        {
          id: "flow1",
          title: "user is able to select a product"
        },
        function*(this: BTContext) {
          this.section("productList");
          const id = yield bp.wait("selectProduct");
          const item = yield bp.request("apiGetProductDetails", "testData");
          yield bp.set({ name: "productDetails", key: id }, item);
          this.section("productDetails");
          yield bp.wait("acceptAGB");
          this.section("new Section");
          yield bp.set("agbAccepted", "true");
        }
      );
      
      const flow2 = flow(
        {
          id: "flow2",
          title: "count actions"
        },
        function*() {
            yield bp.request("selectProduct");
            yield bp.trigger("acceptAGB");
        }
      );

      testScenarios((enable) => {
        enable(flow1());
        enable(flow2());
    }, ({log}) => {
        expect(log?.actions[0].event.name).toBe('selectProduct');
        expect(log?.actions[1].event.name).toBe('apiGetProductDetails');
        expect(log?.actions[2].event.name).toBe('productDetails');
        expect(log?.actions[3].event.name).toBe('acceptAGB');
        expect(log?.actions[4].event.name).toBe('agbAccepted');
    });
})


test("the actions in a log will contain info, if and when the promise got resolved.", (done) => {

  const thread1 = flow({id: 'thread1', title: 'myThread1'}, function* () {
      yield bp.request('asyncRequest', () => delay(10, 'value'));
      yield bp.request('request2');
      yield bp.wait('fin');
  });

  testScenarios((enable) => {
      enable(thread1());
  }, ({log, dispatch}) => {
    if(dispatch('fin')) {
      expect(log?.actions[1]?.payload).toEqual('value');
      expect(log?.actions[1]?.resolve?.requestedActionIndex).toEqual(0);
      expect(log?.actions[1]?.resolve?.requestDuration).toBeGreaterThan(8);
      done();
    }
  });
});



// add test for current.isCompleted
// add test for current.pendingEvents