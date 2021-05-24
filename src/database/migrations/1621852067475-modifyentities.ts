import {MigrationInterface, QueryRunner} from "typeorm";

export class modifyentities1621852067475 implements MigrationInterface {
    name = 'modifyentities1621852067475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_d09d285fe1645cd2f0db811e293"`);
        await queryRunner.query(`CREATE TABLE "invoice_line_item" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL, "paypalInvoiceId" character varying, "invoiceNumber" character varying, "invoiceDate" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "invoiceId" uuid, "orderItemId" uuid, CONSTRAINT "REL_905744ee40f643e812b99db477" UNIQUE ("orderItemId"), CONSTRAINT "PK_4ffb12a7ac2bb69aa7234f30b85" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "paypal_payment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "captureId" character varying, "paypalOrderId" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" uuid, CONSTRAINT "REL_ffea78094b0e29f9722cbb1695" UNIQUE ("paymentId"), CONSTRAINT "PK_84339a466fb29132dfe4062d099" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "invoice" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL, "paypalInvoiceId" character varying, "invoiceNumber" character varying, "invoiceDate" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" uuid, CONSTRAINT "REL_f494ce6746b91e9ec9562af485" UNIQUE ("orderId"), CONSTRAINT "PK_15d25c200d9bcd8a33f698daf18" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cash_payment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "receive" integer, "change" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" uuid, CONSTRAINT "REL_573a71a93922fb5c0381fd3371" UNIQUE ("paymentId"), CONSTRAINT "PK_21bdb6f3c81e2b3557b76ca667d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "REL_d09d285fe1645cd2f0db811e29"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "orderId"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "captureId"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "paypalOrderId"`);
        await queryRunner.query(`ALTER TABLE "payment" ADD "invoiceId" uuid`);
        await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "UQ_87223c7f1d4c2ca51cf69927844" UNIQUE ("invoiceId")`);
        await queryRunner.query(`ALTER TABLE "invoice" ALTER COLUMN "invoiceDate" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "invoice" ALTER COLUMN "invoiceDate" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "invoice_line_item" ADD CONSTRAINT "FK_b09242561f9c47a3288dc66c186" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoice_line_item" ADD CONSTRAINT "FK_905744ee40f643e812b99db477c" FOREIGN KEY ("orderItemId") REFERENCES "order_item"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "paypal_payment" ADD CONSTRAINT "FK_ffea78094b0e29f9722cbb16959" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoice" ADD CONSTRAINT "FK_f494ce6746b91e9ec9562af4857" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_87223c7f1d4c2ca51cf69927844" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cash_payment" ADD CONSTRAINT "FK_573a71a93922fb5c0381fd3371d" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cash_payment" DROP CONSTRAINT "FK_573a71a93922fb5c0381fd3371d"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "FK_87223c7f1d4c2ca51cf69927844"`);
        await queryRunner.query(`ALTER TABLE "invoice" DROP CONSTRAINT "FK_f494ce6746b91e9ec9562af4857"`);
        await queryRunner.query(`ALTER TABLE "paypal_payment" DROP CONSTRAINT "FK_ffea78094b0e29f9722cbb16959"`);
        await queryRunner.query(`ALTER TABLE "invoice_line_item" DROP CONSTRAINT "FK_905744ee40f643e812b99db477c"`);
        await queryRunner.query(`ALTER TABLE "invoice_line_item" DROP CONSTRAINT "FK_b09242561f9c47a3288dc66c186"`);
        await queryRunner.query(`ALTER TABLE "invoice" ALTER COLUMN "invoiceDate" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "invoice" ALTER COLUMN "invoiceDate" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payment" DROP CONSTRAINT "UQ_87223c7f1d4c2ca51cf69927844"`);
        await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN "invoiceId"`);
        await queryRunner.query(`ALTER TABLE "payment" ADD "paypalOrderId" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payment" ADD "captureId" character varying`);
        await queryRunner.query(`ALTER TABLE "payment" ADD "orderId" uuid`);
        await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "REL_d09d285fe1645cd2f0db811e29" UNIQUE ("orderId")`);
        await queryRunner.query(`DROP TABLE "cash_payment"`);
        await queryRunner.query(`DROP TABLE "invoice"`);
        await queryRunner.query(`DROP TABLE "paypal_payment"`);
        await queryRunner.query(`DROP TABLE "invoice_line_item"`);
        await queryRunner.query(`ALTER TABLE "payment" ADD CONSTRAINT "FK_d09d285fe1645cd2f0db811e293" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
