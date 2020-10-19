import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { flow } from '../src/scenario';
import { delay } from './testutils';
import { BThreadContext } from '../src/bthread';

test("log will contain a list of executed actions (sorted)", () => {
    const flow1 = flow(
        {
          name: "flow1",
          description: "user is able to select a product"
        },
        function*(this: BThreadContext) {
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
          name: "flow2",
          description: "count actions"
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
        expect(log.actions[0]?.eventId.name).toBe('selectProduct');
        expect(log.actions[1]?.eventId.name).toBe('apiGetProductDetails');
        expect(log.actions[2]?.eventId.name).toBe('productDetails');
        expect(log.actions[3]?.eventId.name).toBe('acceptAGB');
        expect(log.actions[4]?.eventId.name).toBe('agbAccepted');
    });
})

test("the actions in a log will contain info, if and when the promise got resolved.", (done) => {

  const thread1 = flow({name: 'thread1', description: 'myThread1'}, function* () {
      yield bp.request('asyncRequest', () => delay(10, 'value'));
      yield bp.request('request2');
  });

  testScenarios((enable) => {
      enable(thread1());
  }, ({log, thread}) => {
    if(thread.get({name: 'thread1'})?.isCompleted) {
      expect(log.actions[1]?.payload).toEqual('value');
      expect(log.actions[1]?.resolve?.requestLoopIndex).toEqual(0);
      expect(log.actions[1]?.resolve?.requestDuration).toBeGreaterThan(8);
      done();
    }
  });
});