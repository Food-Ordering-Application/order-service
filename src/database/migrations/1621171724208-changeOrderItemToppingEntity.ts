import {MigrationInterface, QueryRunner} from "typeorm";

export class changeOrderItemToppingEntity1621171724208 implements MigrationInterface {
    name = 'changeOrderItemToppingEntity1621171724208'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_item_topping" RENAME COLUMN "menuItemToppingId" TO "toppingItemId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_item_topping" RENAME COLUMN "toppingItemId" TO "menuItemToppingId"`);
    }

}
